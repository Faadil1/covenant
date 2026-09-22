use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};
use solana_sha256_hasher::hashv;

declare_id!("CEKUNCY7VYeHdwyyWCJTKQkGgMzPeTsx2uwBoQ98wm3z");

#[cfg(test)]
mod tests;

fn advance_position_state(position: &mut Position) -> Result<()> {
    position.nonce = position
        .nonce
        .checked_add(1)
        .ok_or(CovenantError::ArithmeticOverflow)?;
    position.position_version = position
        .position_version
        .checked_add(1)
        .ok_or(CovenantError::ArithmeticOverflow)?;
    Ok(())
}

const USDC_MINT: Pubkey = Pubkey::new_from_array([
    198, 250, 122, 243, 190, 219, 173, 58, 61, 101, 243, 106, 171, 201, 116, 49,
    177, 187, 228, 194, 210, 246, 224, 228, 124, 166, 2, 3, 69, 47, 93, 97,
]);
const SPL_TOKEN_PROGRAM: Pubkey = Pubkey::new_from_array([
    6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206, 235, 121, 172,
    28, 180, 133, 237, 95, 91, 55, 145, 58, 140, 245, 133, 126, 255, 0, 169,
]);
const TOKEN_2022_PROGRAM: Pubkey = Pubkey::new_from_array([
    6, 221, 246, 225, 238, 117, 143, 222, 24, 66, 93, 188, 228, 108, 205, 218,
    182, 26, 252, 77, 131, 185, 13, 39, 254, 189, 249, 40, 216, 161, 139, 252,
]);
const JUPITER_V6_PROGRAM: Pubkey = Pubkey::new_from_array([
    4, 121, 213, 91, 242, 49, 192, 110, 238, 116, 197, 110, 206, 104, 21, 7,
    253, 177, 178, 222, 163, 244, 142, 81, 2, 177, 205, 162, 86, 188, 19, 143,
]);
const OPERATOR_ACQUIRE: u8 = 0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct TokenAccountBase {
    mint: Pubkey,
    authority: Pubkey,
    amount: u64,
}

fn read_token_account_base(info: &AccountInfo<'_>) -> Result<TokenAccountBase> {
    let data = info.try_borrow_data()?;
    require!(data.len() >= 72, CovenantError::MalformedTokenAccount);

    let mint = Pubkey::new_from_array(
        data[0..32]
            .try_into()
            .map_err(|_| CovenantError::MalformedTokenAccount)?,
    );
    let authority = Pubkey::new_from_array(
        data[32..64]
            .try_into()
            .map_err(|_| CovenantError::MalformedTokenAccount)?,
    );
    let amount = u64::from_le_bytes(
        data[64..72]
            .try_into()
            .map_err(|_| CovenantError::MalformedTokenAccount)?,
    );

    Ok(TokenAccountBase {
        mint,
        authority,
        amount,
    })
}

fn validate_common_transition(
    position: &Position,
    evaluator: Pubkey,
    proof: &TransitionProofArgs,
    now_unix: i64,
) -> Result<()> {
    require!(!position.frozen, CovenantError::PositionFrozen);
    require_keys_eq!(evaluator, position.evaluator, CovenantError::WrongEvaluator);
    require!(
        proof.covenant_hash == position.covenant_hash,
        CovenantError::CovenantVersionMismatch
    );
    require!(
        proof.position_version == position.position_version,
        CovenantError::PositionVersionMismatch
    );
    require!(proof.nonce == position.nonce, CovenantError::NonceMismatch);
    require!(proof.expiry_unix >= now_unix, CovenantError::ProofExpired);
    require!(
        proof.economic_value_usd_micros > 0
            && proof.economic_value_usd_micros <= position.max_transition_value_usd_micros,
        CovenantError::AmountOutsideAuthority
    );

    let operator_bit = 1u16
        .checked_shl(u32::from(proof.operator))
        .ok_or(CovenantError::OperatorNotAllowed)?;
    require!(
        operator_bit & position.allowed_operator_mask != 0,
        CovenantError::OperatorNotAllowed
    );

    for hash in [
        proof.claim_passport_hash,
        proof.evidence_root,
        proof.pre_state_hash,
        proof.proposed_post_state_hash,
        proof.receipt_hash,
        proof.execution_commitment_hash,
    ] {
        require!(hash != [0u8; 32], CovenantError::ZeroProofField);
    }

    Ok(())
}

fn compute_swap_invocation_hash(
    program_id: &Pubkey,
    metas: &[AccountMeta],
    data: &[u8],
) -> [u8; 32] {
    let mut chunks: Vec<Vec<u8>> = Vec::with_capacity(2 + metas.len() * 2);
    chunks.push(program_id.to_bytes().to_vec());

    for meta in metas {
        chunks.push(meta.pubkey.to_bytes().to_vec());
        chunks.push(vec![
            if meta.is_signer { 1 } else { 0 },
            if meta.is_writable { 1 } else { 0 },
        ]);
    }

    chunks.push(data.to_vec());
    let refs: Vec<&[u8]> = chunks.iter().map(Vec::as_slice).collect();
    hashv(&refs).to_bytes()
}

fn compute_onchain_execution_commitment_hash(
    input_mint: &Pubkey,
    output_mint: &Pubkey,
    input_amount: u64,
    min_out: u64,
    swap_invocation_hash: &[u8; 32],
) -> [u8; 32] {
    let input_amount_bytes = input_amount.to_le_bytes();
    let min_out_bytes = min_out.to_le_bytes();
    hashv(&[
        input_mint.as_ref(),
        output_mint.as_ref(),
        &input_amount_bytes,
        &min_out_bytes,
        swap_invocation_hash,
    ])
    .to_bytes()
}

#[program]
pub mod covenant_runtime {
    use super::*;

    pub fn initialize_position(
        ctx: Context<InitializePosition>,
        position_id: [u8; 32],
        covenant_hash: [u8; 32],
        evaluator: Pubkey,
        max_transition_value_usd_micros: u64,
        allowed_operator_mask: u16,
    ) -> Result<()> {
        require!(position_id != [0u8; 32], CovenantError::InvalidPositionId);
        require!(covenant_hash != [0u8; 32], CovenantError::InvalidCovenant);
        require!(evaluator != Pubkey::default(), CovenantError::InvalidEvaluator);
        require!(max_transition_value_usd_micros > 0, CovenantError::InvalidAmount);
        require!(allowed_operator_mask != 0, CovenantError::NoOperatorsAllowed);

        let position = &mut ctx.accounts.position;
        position.position_id = position_id;
        position.owner = ctx.accounts.owner.key();
        position.evaluator = evaluator;
        position.covenant_hash = covenant_hash;
        position.position_version = 0;
        position.nonce = 0;
        position.max_transition_value_usd_micros = max_transition_value_usd_micros;
        position.allowed_operator_mask = allowed_operator_mask;
        position.frozen = false;
        position.current_claim_mint = Pubkey::default();
        position.last_receipt_hash = [0u8; 32];
        position.bump = ctx.bumps.position;

        let (_, vault_bump) = Pubkey::find_program_address(
            &[b"vault", position.key().as_ref()],
            ctx.program_id,
        );
        position.vault_bump = vault_bump;

        emit!(PositionInitialized {
            position: position.key(),
            position_id,
            owner: position.owner,
            evaluator,
            covenant_hash,
            max_transition_value_usd_micros,
            allowed_operator_mask,
        });

        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, CovenantError::InvalidAmount);

        transfer(
            CpiContext::new(
                System::id(),
                Transfer {
                    from: ctx.accounts.owner.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;

        advance_position_state(&mut ctx.accounts.position)?;

        emit!(PositionFunded {
            position: ctx.accounts.position.key(),
            amount,
            new_position_version: ctx.accounts.position.position_version,
            new_nonce: ctx.accounts.position.nonce,
        });

        Ok(())
    }

    /// T3a authority-boundary primitive.
    ///
    /// The deterministic evaluator is outside the onchain trust boundary for
    /// issuer/legal and live-market facts, but it cannot grant generic wallet
    /// control. It must co-sign an exact proof packet. The program then binds
    /// that authorization to the stored Covenant, position version, nonce,
    /// operator, amount, destination and expiry before the PDA vault can move
    /// value.
    ///
    /// The canonical Stocklana path will replace the settlement transfer with
    /// a constrained swap/settlement CPI while preserving these checks.
    pub fn execute_proven_transition(
        ctx: Context<ExecuteProvenTransition>,
        proof: TransitionProofArgs,
        settlement: SystemSettlementArgs,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let position = &mut ctx.accounts.position;

        validate_common_transition(
            position,
            ctx.accounts.evaluator.key(),
            &proof,
            clock.unix_timestamp,
        )?;
        require!(
            settlement.settlement_amount_lamports > 0,
            CovenantError::InvalidAmount
        );
        require_keys_eq!(
            settlement.destination,
            ctx.accounts.settlement.key(),
            CovenantError::DestinationMismatch
        );
        require!(
            ctx.accounts.vault.lamports() >= settlement.settlement_amount_lamports,
            CovenantError::InsufficientVaultBalance
        );

        let position_key = position.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"vault",
            position_key.as_ref(),
            &[position.vault_bump],
        ]];

        transfer(
            CpiContext::new_with_signer(
                System::id(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.settlement.to_account_info(),
                },
                signer_seeds,
            ),
            settlement.settlement_amount_lamports,
        )?;

        let consumed_nonce = position.nonce;
        advance_position_state(position)?;
        position.last_receipt_hash = proof.receipt_hash;

        emit!(TransitionExecuted {
            position: position.key(),
            proposer: ctx.accounts.proposer.key(),
            evaluator: ctx.accounts.evaluator.key(),
            operator: proof.operator,
            economic_value_usd_micros: proof.economic_value_usd_micros,
            settlement_amount_lamports: settlement.settlement_amount_lamports,
            destination: settlement.destination,
            nonce: consumed_nonce,
            new_position_version: position.position_version,
            covenant_hash: proof.covenant_hash,
            claim_passport_hash: proof.claim_passport_hash,
            evidence_root: proof.evidence_root,
            receipt_hash: proof.receipt_hash,
        });

        Ok(())
    }

    /// T3b exact Stocklana ACQUIRE boundary.
    ///
    /// The Position PDA is the Jupiter taker/transfer authority. The evaluator
    /// signs an exact proof, while this program independently verifies the
    /// exact input/output token accounts, Jupiter program, CPI account order +
    /// privileges + data, minimum output, and post-settlement balance deltas.
    pub fn execute_apple_acquire<'info>(
        ctx: Context<'info, ExecuteAppleAcquire<'info>>,
        proof: TransitionProofArgs,
        args: JupiterAcquireArgs,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let position = &mut ctx.accounts.position;

        validate_common_transition(
            position,
            ctx.accounts.evaluator.key(),
            &proof,
            clock.unix_timestamp,
        )?;

        require!(
            proof.operator == OPERATOR_ACQUIRE,
            CovenantError::OperatorNotAllowed
        );
        require!(
            proof.target_claim_mint != Pubkey::default(),
            CovenantError::TargetClaimMissing
        );
        require!(args.input_amount > 0, CovenantError::InvalidAmount);
        require!(args.min_out > 0, CovenantError::InvalidMinimumOutput);
        require!(
            args.swap_invocation_hash != [0u8; 32],
            CovenantError::ZeroProofField
        );
        require!(!args.swap_data.is_empty(), CovenantError::EmptySwapInstruction);
        require_keys_eq!(args.input_mint, USDC_MINT, CovenantError::WrongInputMint);
        require_keys_eq!(
            args.output_mint,
            proof.target_claim_mint,
            CovenantError::WrongOutputMint
        );
        require_keys_eq!(
            ctx.accounts.jupiter_program.key(),
            JUPITER_V6_PROGRAM,
            CovenantError::WrongExecutionProgram
        );

        let input_info = ctx.accounts.input_token_account.to_account_info();
        let output_info = ctx.accounts.output_token_account.to_account_info();

        require_keys_eq!(
            *input_info.owner,
            SPL_TOKEN_PROGRAM,
            CovenantError::WrongInputTokenProgram
        );
        require_keys_eq!(
            *output_info.owner,
            TOKEN_2022_PROGRAM,
            CovenantError::WrongOutputTokenProgram
        );

        let position_key = position.key();
        let input_before = read_token_account_base(&input_info)?;
        let output_before = read_token_account_base(&output_info)?;

        require_keys_eq!(
            input_before.mint,
            args.input_mint,
            CovenantError::WrongInputMint
        );
        require_keys_eq!(
            output_before.mint,
            args.output_mint,
            CovenantError::WrongOutputMint
        );
        require_keys_eq!(
            input_before.authority,
            position_key,
            CovenantError::TokenAccountAuthorityMismatch
        );
        require_keys_eq!(
            output_before.authority,
            position_key,
            CovenantError::TokenAccountAuthorityMismatch
        );

        let expected_execution_commitment = compute_onchain_execution_commitment_hash(
            &args.input_mint,
            &args.output_mint,
            args.input_amount,
            args.min_out,
            &args.swap_invocation_hash,
        );
        require!(
            expected_execution_commitment == proof.execution_commitment_hash,
            CovenantError::ExecutionCommitmentMismatch
        );

        require!(
            args.swap_account_flags.len() == ctx.remaining_accounts.len(),
            CovenantError::SwapAccountShapeMismatch
        );

        let mut metas: Vec<AccountMeta> =
            Vec::with_capacity(ctx.remaining_accounts.len());
        let mut infos: Vec<AccountInfo<'_>> =
            Vec::with_capacity(ctx.remaining_accounts.len() + 1);
        let mut saw_position = false;
        let mut saw_input = false;
        let mut saw_output = false;

        for (index, account) in ctx.remaining_accounts.iter().enumerate() {
            let flags = args.swap_account_flags[index];
            require!(flags & !0b11 == 0, CovenantError::InvalidAccountFlags);

            let wants_signer = flags & 0b01 != 0;
            let wants_writable = flags & 0b10 != 0;
            let key = account.key();

            if wants_signer {
                require!(
                    account.is_signer || key == position_key,
                    CovenantError::MissingRequiredSigner
                );
            }
            if wants_writable {
                require!(
                    account.is_writable,
                    CovenantError::InsufficientAccountPrivilege
                );
            }

            if key == position_key {
                saw_position = true;
            }
            if key == ctx.accounts.input_token_account.key() {
                saw_input = true;
            }
            if key == ctx.accounts.output_token_account.key() {
                saw_output = true;
            }

            let meta = if wants_writable {
                AccountMeta::new(key, wants_signer)
            } else {
                AccountMeta::new_readonly(key, wants_signer)
            };
            metas.push(meta);
            infos.push(account.clone());
        }

        require!(saw_position, CovenantError::PositionMissingFromSwap);
        require!(saw_input, CovenantError::InputAccountMissingFromSwap);
        require!(saw_output, CovenantError::OutputAccountMissingFromSwap);

        let computed_swap_hash =
            compute_swap_invocation_hash(&JUPITER_V6_PROGRAM, &metas, &args.swap_data);
        require!(
            computed_swap_hash == args.swap_invocation_hash,
            CovenantError::SwapInvocationMismatch
        );

        let instruction = Instruction {
            program_id: JUPITER_V6_PROGRAM,
            accounts: metas,
            data: args.swap_data.clone(),
        };
        infos.push(ctx.accounts.jupiter_program.to_account_info());

        let owner = position.owner;
        let position_id = position.position_id;
        let bump = [position.bump];
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"position",
            owner.as_ref(),
            position_id.as_ref(),
            &bump,
        ]];

        invoke_signed(&instruction, &infos, signer_seeds)?;

        let input_after = read_token_account_base(&input_info)?;
        let output_after = read_token_account_base(&output_info)?;

        let input_spent = input_before
            .amount
            .checked_sub(input_after.amount)
            .ok_or(CovenantError::UnexpectedInputBalance)?;
        let output_received = output_after
            .amount
            .checked_sub(output_before.amount)
            .ok_or(CovenantError::UnexpectedOutputBalance)?;

        require!(
            input_spent == args.input_amount,
            CovenantError::InputAmountMismatch
        );
        require!(
            output_received >= args.min_out,
            CovenantError::MinimumOutputNotMet
        );

        let consumed_nonce = position.nonce;
        advance_position_state(position)?;
        position.current_claim_mint = args.output_mint;
        position.last_receipt_hash = proof.receipt_hash;

        emit!(AppleAcquireExecuted {
            position: position.key(),
            proposer: ctx.accounts.proposer.key(),
            evaluator: ctx.accounts.evaluator.key(),
            input_mint: args.input_mint,
            output_mint: args.output_mint,
            input_amount: args.input_amount,
            output_received,
            min_out: args.min_out,
            economic_value_usd_micros: proof.economic_value_usd_micros,
            nonce: consumed_nonce,
            new_position_version: position.position_version,
            execution_commitment_hash: proof.execution_commitment_hash,
            swap_invocation_hash: args.swap_invocation_hash,
            receipt_hash: proof.receipt_hash,
        });

        Ok(())
    }

    pub fn freeze(ctx: Context<OwnerControl>) -> Result<()> {
        require!(!ctx.accounts.position.frozen, CovenantError::PositionAlreadyFrozen);
        ctx.accounts.position.frozen = true;
        advance_position_state(&mut ctx.accounts.position)?;

        emit!(PositionFrozen {
            position: ctx.accounts.position.key(),
            owner: ctx.accounts.owner.key(),
            new_position_version: ctx.accounts.position.position_version,
            new_nonce: ctx.accounts.position.nonce,
        });
        Ok(())
    }

    pub fn unfreeze(ctx: Context<OwnerControl>) -> Result<()> {
        require!(ctx.accounts.position.frozen, CovenantError::PositionNotFrozen);
        ctx.accounts.position.frozen = false;
        advance_position_state(&mut ctx.accounts.position)?;

        emit!(PositionUnfrozen {
            position: ctx.accounts.position.key(),
            owner: ctx.accounts.owner.key(),
            new_position_version: ctx.accounts.position.position_version,
            new_nonce: ctx.accounts.position.nonce,
        });
        Ok(())
    }

    pub fn amend_covenant(
        ctx: Context<OwnerControl>,
        new_covenant_hash: [u8; 32],
    ) -> Result<()> {
        require!(
            new_covenant_hash != [0u8; 32],
            CovenantError::InvalidCovenant
        );
        require!(
            new_covenant_hash != ctx.accounts.position.covenant_hash,
            CovenantError::CovenantUnchanged
        );

        let old_covenant_hash = ctx.accounts.position.covenant_hash;
        ctx.accounts.position.covenant_hash = new_covenant_hash;
        advance_position_state(&mut ctx.accounts.position)?;

        emit!(CovenantAmended {
            position: ctx.accounts.position.key(),
            owner: ctx.accounts.owner.key(),
            old_covenant_hash,
            new_covenant_hash,
            new_position_version: ctx.accounts.position.position_version,
            new_nonce: ctx.accounts.position.nonce,
        });
        Ok(())
    }

    pub fn rotate_evaluator(
        ctx: Context<OwnerControl>,
        new_evaluator: Pubkey,
    ) -> Result<()> {
        require!(
            new_evaluator != Pubkey::default(),
            CovenantError::InvalidEvaluator
        );
        require!(
            new_evaluator != ctx.accounts.position.evaluator,
            CovenantError::EvaluatorUnchanged
        );

        let old_evaluator = ctx.accounts.position.evaluator;
        ctx.accounts.position.evaluator = new_evaluator;
        advance_position_state(&mut ctx.accounts.position)?;

        emit!(EvaluatorRotated {
            position: ctx.accounts.position.key(),
            old_evaluator,
            new_evaluator,
            new_position_version: ctx.accounts.position.position_version,
            new_nonce: ctx.accounts.position.nonce,
        });
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct TransitionProofArgs {
    pub covenant_hash: [u8; 32],
    pub claim_passport_hash: [u8; 32],
    pub evidence_root: [u8; 32],
    pub pre_state_hash: [u8; 32],
    pub proposed_post_state_hash: [u8; 32],
    pub receipt_hash: [u8; 32],
    pub execution_commitment_hash: [u8; 32],
    pub target_claim_mint: Pubkey,
    pub position_version: u64,
    pub nonce: u64,
    pub expiry_unix: i64,
    pub operator: u8,
    pub economic_value_usd_micros: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct SystemSettlementArgs {
    pub settlement_amount_lamports: u64,
    pub destination: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct JupiterAcquireArgs {
    pub input_mint: Pubkey,
    pub output_mint: Pubkey,
    pub input_amount: u64,
    pub min_out: u64,
    pub swap_invocation_hash: [u8; 32],
    /// One byte per ordered Jupiter account: bit 0 = signer, bit 1 = writable.
    pub swap_account_flags: Vec<u8>,
    pub swap_data: Vec<u8>,
}

#[account]
pub struct Position {
    pub position_id: [u8; 32],
    pub owner: Pubkey,
    pub evaluator: Pubkey,
    pub covenant_hash: [u8; 32],
    pub position_version: u64,
    pub nonce: u64,
    pub max_transition_value_usd_micros: u64,
    pub allowed_operator_mask: u16,
    pub frozen: bool,
    pub current_claim_mint: Pubkey,
    pub last_receipt_hash: [u8; 32],
    pub bump: u8,
    pub vault_bump: u8,
}

impl Position {
    pub const SPACE: usize = 221;
}

#[derive(Accounts)]
#[instruction(position_id: [u8; 32])]
pub struct InitializePosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + Position::SPACE,
        seeds = [b"position", owner.key().as_ref(), position_id.as_ref()],
        bump,
    )]
    pub position: Account<'info, Position>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner,
        seeds = [b"position", owner.key().as_ref(), position.position_id.as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, Position>,

    #[account(
        mut,
        seeds = [b"vault", position.key().as_ref()],
        bump = position.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteProvenTransition<'info> {
    pub proposer: Signer<'info>,
    pub evaluator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"position", position.owner.as_ref(), position.position_id.as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, Position>,

    #[account(
        mut,
        seeds = [b"vault", position.key().as_ref()],
        bump = position.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub settlement: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteAppleAcquire<'info> {
    pub proposer: Signer<'info>,
    pub evaluator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"position", position.owner.as_ref(), position.position_id.as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, Position>,

    /// CHECK: program owner, mint, Position authority and balance are verified manually.
    #[account(mut)]
    pub input_token_account: UncheckedAccount<'info>,

    /// CHECK: Token-2022 program owner, exact Claim mint, Position authority and balance are verified manually.
    #[account(mut)]
    pub output_token_account: UncheckedAccount<'info>,

    /// CHECK: exact Jupiter V6 program id is verified before CPI.
    pub jupiter_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct OwnerControl<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner,
        seeds = [b"position", owner.key().as_ref(), position.position_id.as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, Position>,
}

#[event]
pub struct PositionInitialized {
    pub position: Pubkey,
    pub position_id: [u8; 32],
    pub owner: Pubkey,
    pub evaluator: Pubkey,
    pub covenant_hash: [u8; 32],
    pub max_transition_value_usd_micros: u64,
    pub allowed_operator_mask: u16,
}

#[event]
pub struct PositionFunded {
    pub position: Pubkey,
    pub amount: u64,
    pub new_position_version: u64,
    pub new_nonce: u64,
}

#[event]
pub struct TransitionExecuted {
    pub position: Pubkey,
    pub proposer: Pubkey,
    pub evaluator: Pubkey,
    pub operator: u8,
    pub economic_value_usd_micros: u64,
    pub settlement_amount_lamports: u64,
    pub destination: Pubkey,
    pub nonce: u64,
    pub new_position_version: u64,
    pub covenant_hash: [u8; 32],
    pub claim_passport_hash: [u8; 32],
    pub evidence_root: [u8; 32],
    pub receipt_hash: [u8; 32],
}

#[event]
pub struct AppleAcquireExecuted {
    pub position: Pubkey,
    pub proposer: Pubkey,
    pub evaluator: Pubkey,
    pub input_mint: Pubkey,
    pub output_mint: Pubkey,
    pub input_amount: u64,
    pub output_received: u64,
    pub min_out: u64,
    pub economic_value_usd_micros: u64,
    pub nonce: u64,
    pub new_position_version: u64,
    pub execution_commitment_hash: [u8; 32],
    pub swap_invocation_hash: [u8; 32],
    pub receipt_hash: [u8; 32],
}

#[event]
pub struct PositionFrozen {
    pub position: Pubkey,
    pub owner: Pubkey,
    pub new_position_version: u64,
    pub new_nonce: u64,
}

#[event]
pub struct PositionUnfrozen {
    pub position: Pubkey,
    pub owner: Pubkey,
    pub new_position_version: u64,
    pub new_nonce: u64,
}

#[event]
pub struct CovenantAmended {
    pub position: Pubkey,
    pub owner: Pubkey,
    pub old_covenant_hash: [u8; 32],
    pub new_covenant_hash: [u8; 32],
    pub new_position_version: u64,
    pub new_nonce: u64,
}

#[event]
pub struct EvaluatorRotated {
    pub position: Pubkey,
    pub old_evaluator: Pubkey,
    pub new_evaluator: Pubkey,
    pub new_position_version: u64,
    pub new_nonce: u64,
}

#[error_code]
pub enum CovenantError {
    #[msg("Position id cannot be zero")]
    InvalidPositionId,
    #[msg("Covenant hash cannot be zero")]
    InvalidCovenant,
    #[msg("New Covenant hash must differ from the current Covenant")]
    CovenantUnchanged,
    #[msg("Transition amount is invalid")]
    InvalidAmount,
    #[msg("At least one transition operator must be authorized")]
    NoOperatorsAllowed,
    #[msg("Position is frozen")]
    PositionFrozen,
    #[msg("Position is already frozen")]
    PositionAlreadyFrozen,
    #[msg("Position is not frozen")]
    PositionNotFrozen,
    #[msg("Evaluator signer is not the evaluator bound to this position")]
    WrongEvaluator,
    #[msg("Proof Covenant hash does not match the position Covenant")]
    CovenantVersionMismatch,
    #[msg("Proof position version does not match current state")]
    PositionVersionMismatch,
    #[msg("Proof nonce does not match current state")]
    NonceMismatch,
    #[msg("Proof has expired")]
    ProofExpired,
    #[msg("Transition amount exceeds delegated authority")]
    AmountOutsideAuthority,
    #[msg("Settlement destination differs from the proof commitment")]
    DestinationMismatch,
    #[msg("Transition operator is outside delegated authority")]
    OperatorNotAllowed,
    #[msg("A required proof field is zero/unbound")]
    ZeroProofField,
    #[msg("Vault cannot fund this exact transition")]
    InsufficientVaultBalance,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Evaluator address is invalid")]
    InvalidEvaluator,
    #[msg("New evaluator must differ from the current evaluator")]
    EvaluatorUnchanged,
    #[msg("Target claim mint is missing from proof")]
    TargetClaimMissing,
    #[msg("Minimum output must be greater than zero")]
    InvalidMinimumOutput,
    #[msg("Swap instruction data is empty")]
    EmptySwapInstruction,
    #[msg("Input mint is not canonical USDC")]
    WrongInputMint,
    #[msg("Output mint does not match the proven Claim")]
    WrongOutputMint,
    #[msg("Execution program is not the approved Jupiter V6 program")]
    WrongExecutionProgram,
    #[msg("Input token account is not owned by the classic SPL Token program")]
    WrongInputTokenProgram,
    #[msg("Output claim account is not owned by Token-2022")]
    WrongOutputTokenProgram,
    #[msg("Token account base layout is malformed")]
    MalformedTokenAccount,
    #[msg("Token account authority is not the canonical Invariant Position PDA")]
    TokenAccountAuthorityMismatch,
    #[msg("Proof execution commitment does not match the exact acquisition")]
    ExecutionCommitmentMismatch,
    #[msg("Jupiter account flags do not match the ordered remaining accounts")]
    SwapAccountShapeMismatch,
    #[msg("Jupiter account flags contain unsupported bits")]
    InvalidAccountFlags,
    #[msg("A Jupiter-required signer is unavailable")]
    MissingRequiredSigner,
    #[msg("Outer transaction does not grant a required writable privilege")]
    InsufficientAccountPrivilege,
    #[msg("Invariant Position PDA is missing from Jupiter swap accounts")]
    PositionMissingFromSwap,
    #[msg("Position input token account is missing from Jupiter swap accounts")]
    InputAccountMissingFromSwap,
    #[msg("Position output token account is missing from Jupiter swap accounts")]
    OutputAccountMissingFromSwap,
    #[msg("Exact Jupiter invocation does not match the evaluator-approved hash")]
    SwapInvocationMismatch,
    #[msg("Input balance increased unexpectedly during ACQUIRE")]
    UnexpectedInputBalance,
    #[msg("Output balance decreased unexpectedly during ACQUIRE")]
    UnexpectedOutputBalance,
    #[msg("Actual input spend differs from the proof-bound ExactIn amount")]
    InputAmountMismatch,
    #[msg("Actual output is below the proof-bound minimum")]
    MinimumOutputNotMet,
}
