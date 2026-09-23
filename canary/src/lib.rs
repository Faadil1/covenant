use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint,
    entrypoint::ProgramResult,
    hash::hashv,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::Sysvar,
};

entrypoint!(process_instruction);

const STATE_LEN: usize = 81;
const DOMAIN: &[u8] = b"COVENANT_CANARY_AUTH_V1";

const ERR_BAD_INSTRUCTION: u32 = 1;
const ERR_STATE_OWNER: u32 = 2;
const ERR_NOT_SIGNER: u32 = 3;
const ERR_ALREADY_INITIALIZED: u32 = 4;
const ERR_NOT_INITIALIZED: u32 = 5;
const ERR_EVALUATOR: u32 = 6;
const ERR_NONCE: u32 = 7;
const ERR_EXPIRED: u32 = 8;
const ERR_AMOUNT: u32 = 9;
const ERR_COMMITMENT: u32 = 10;
const ERR_RENT: u32 = 11;

fn custom(code: u32) -> ProgramError {
    ProgramError::Custom(code)
}

fn read_u64(slice: &[u8]) -> Result<u64, ProgramError> {
    let bytes: [u8; 8] = slice.try_into().map_err(|_| custom(ERR_BAD_INSTRUCTION))?;
    Ok(u64::from_le_bytes(bytes))
}

fn read_i64(slice: &[u8]) -> Result<i64, ProgramError> {
    let bytes: [u8; 8] = slice.try_into().map_err(|_| custom(ERR_BAD_INSTRUCTION))?;
    Ok(i64::from_le_bytes(bytes))
}

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let (&tag, payload) = instruction_data
        .split_first()
        .ok_or_else(|| custom(ERR_BAD_INSTRUCTION))?;

    match tag {
        0 => initialize(program_id, accounts, payload),
        1 => execute(program_id, accounts, payload),
        _ => Err(custom(ERR_BAD_INSTRUCTION)),
    }
}

fn initialize(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    payload: &[u8],
) -> ProgramResult {
    if payload.len() != 40 {
        return Err(custom(ERR_BAD_INSTRUCTION));
    }

    let mut iter = accounts.iter();
    let state = next_account_info(&mut iter)?;
    let authority = next_account_info(&mut iter)?;
    let evaluator = next_account_info(&mut iter)?;

    if state.owner != program_id || state.data_len() < STATE_LEN {
        return Err(custom(ERR_STATE_OWNER));
    }
    if !authority.is_signer {
        return Err(custom(ERR_NOT_SIGNER));
    }

    let mut data = state.try_borrow_mut_data()?;
    if data[0] != 0 {
        return Err(custom(ERR_ALREADY_INITIALIZED));
    }

    let covenant_hash = &payload[0..32];
    let max_lamports = read_u64(&payload[32..40])?;
    if max_lamports == 0 {
        return Err(custom(ERR_AMOUNT));
    }

    data[0] = 1;
    data[1..9].copy_from_slice(&0u64.to_le_bytes());
    data[9..41].copy_from_slice(evaluator.key.as_ref());
    data[41..73].copy_from_slice(covenant_hash);
    data[73..81].copy_from_slice(&max_lamports.to_le_bytes());

    Ok(())
}

fn execute(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    payload: &[u8],
) -> ProgramResult {
    if payload.len() != 56 {
        return Err(custom(ERR_BAD_INSTRUCTION));
    }

    let mut iter = accounts.iter();
    let state = next_account_info(&mut iter)?;
    let evaluator = next_account_info(&mut iter)?;
    let destination = next_account_info(&mut iter)?;

    if state.owner != program_id || state.data_len() < STATE_LEN {
        return Err(custom(ERR_STATE_OWNER));
    }
    if !evaluator.is_signer {
        return Err(custom(ERR_NOT_SIGNER));
    }

    let expected_nonce = read_u64(&payload[0..8])?;
    let amount = read_u64(&payload[8..16])?;
    let expiry_unix = read_i64(&payload[16..24])?;
    let commitment = &payload[24..56];

    let (nonce, stored_evaluator, covenant_hash, max_lamports) = {
        let data = state.try_borrow_data()?;
        if data[0] != 1 {
            return Err(custom(ERR_NOT_INITIALIZED));
        }
        let nonce = read_u64(&data[1..9])?;
        let stored_evaluator = Pubkey::new_from_array(
            data[9..41]
                .try_into()
                .map_err(|_| custom(ERR_BAD_INSTRUCTION))?,
        );
        let covenant_hash: [u8; 32] = data[41..73]
            .try_into()
            .map_err(|_| custom(ERR_BAD_INSTRUCTION))?;
        let max_lamports = read_u64(&data[73..81])?;
        (nonce, stored_evaluator, covenant_hash, max_lamports)
    };

    if stored_evaluator != *evaluator.key {
        return Err(custom(ERR_EVALUATOR));
    }
    if expected_nonce != nonce {
        return Err(custom(ERR_NONCE));
    }
    if Clock::get()?.unix_timestamp > expiry_unix {
        return Err(custom(ERR_EXPIRED));
    }
    if amount == 0 || amount > max_lamports {
        return Err(custom(ERR_AMOUNT));
    }

    let nonce_bytes = expected_nonce.to_le_bytes();
    let amount_bytes = amount.to_le_bytes();
    let expiry_bytes = expiry_unix.to_le_bytes();
    let expected_commitment = hashv(&[
        DOMAIN,
        &covenant_hash,
        destination.key.as_ref(),
        &nonce_bytes,
        &amount_bytes,
        &expiry_bytes,
    ]);
    if expected_commitment.as_ref() != commitment {
        return Err(custom(ERR_COMMITMENT));
    }

    let state_lamports = state.lamports();
    let rent_floor = Rent::get()?.minimum_balance(state.data_len());
    let remaining = state_lamports
        .checked_sub(amount)
        .ok_or_else(|| custom(ERR_AMOUNT))?;
    if remaining < rent_floor {
        return Err(custom(ERR_RENT));
    }

    let destination_lamports = destination.lamports();
    **state.try_borrow_mut_lamports()? = remaining;
    **destination.try_borrow_mut_lamports()? = destination_lamports
        .checked_add(amount)
        .ok_or_else(|| custom(ERR_AMOUNT))?;

    let mut data = state.try_borrow_mut_data()?;
    data[1..9].copy_from_slice(
        &nonce
            .checked_add(1)
            .ok_or_else(|| custom(ERR_NONCE))?
            .to_le_bytes(),
    );

    Ok(())
}
