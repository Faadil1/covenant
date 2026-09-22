use crate::{TransitionProofArgs, ID as PROGRAM_ID};
use anchor_lang::{
    prelude::Pubkey,
    system_program,
    AccountDeserialize,
    InstructionData,
    ToAccountMetas,
};
use litesvm::LiteSVM;
use solana_sdk::{
    clock::Clock,
    instruction::Instruction,
    signature::{Keypair, Signer},
    transaction::Transaction,
};

const LAMPORTS_PER_SOL: u64 = 1_000_000_000;
const DEPOSIT_AMOUNT: u64 = 200_000_000;
const TRANSITION_AMOUNT: u64 = 50_000_000;
const OPERATOR_ACQUIRE: u8 = 0;
const ACQUIRE_MASK: u16 = 1 << OPERATOR_ACQUIRE;

struct Fixture {
    svm: LiteSVM,
    owner: Keypair,
    evaluator: Keypair,
    proposer: Keypair,
    settlement: Keypair,
    position: Pubkey,
    vault: Pubkey,
    position_id: [u8; 32],
    covenant_hash: [u8; 32],
}

fn nonzero(byte: u8) -> [u8; 32] {
    [byte; 32]
}

fn send(
    svm: &mut LiteSVM,
    payer: &Keypair,
    instructions: &[Instruction],
    signers: &[&Keypair],
) -> Result<(), String> {
    let blockhash = svm.latest_blockhash();
    let mut all_signers = vec![payer];
    for signer in signers {
        if signer.pubkey() != payer.pubkey()
            && !all_signers
                .iter()
                .any(|existing| existing.pubkey() == signer.pubkey())
        {
            all_signers.push(*signer);
        }
    }

    let tx = Transaction::new_signed_with_payer(
        instructions,
        Some(&payer.pubkey()),
        &all_signers,
        blockhash,
    );

    svm.send_transaction(tx)
        .map(|_| ())
        .map_err(|error| format!("{error:?}"))
}

fn initialize_ix(
    owner: Pubkey,
    position: Pubkey,
    position_id: [u8; 32],
    covenant_hash: [u8; 32],
    evaluator: Pubkey,
) -> Instruction {
    Instruction {
        program_id: PROGRAM_ID,
        accounts: crate::accounts::InitializePosition {
            owner,
            position,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: crate::instruction::InitializePosition {
            position_id,
            covenant_hash,
            evaluator,
            max_transition_value_usd_micros: 100_000_000,
            allowed_operator_mask: ACQUIRE_MASK,
        }
        .data(),
    }
}

fn deposit_ix(owner: Pubkey, position: Pubkey, vault: Pubkey) -> Instruction {
    Instruction {
        program_id: PROGRAM_ID,
        accounts: crate::accounts::Deposit {
            owner,
            position,
            vault,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: crate::instruction::Deposit {
            amount: DEPOSIT_AMOUNT,
        }
        .data(),
    }
}

fn freeze_ix(owner: Pubkey, position: Pubkey) -> Instruction {
    Instruction {
        program_id: PROGRAM_ID,
        accounts: crate::accounts::OwnerControl { owner, position }
            .to_account_metas(None),
        data: crate::instruction::Freeze {}.data(),
    }
}

fn amend_covenant_ix(
    owner: Pubkey,
    position: Pubkey,
    new_covenant_hash: [u8; 32],
) -> Instruction {
    Instruction {
        program_id: PROGRAM_ID,
        accounts: crate::accounts::OwnerControl { owner, position }
            .to_account_metas(None),
        data: crate::instruction::AmendCovenant { new_covenant_hash }.data(),
    }
}

fn transition_ix(
    proposer: Pubkey,
    evaluator: Pubkey,
    position: Pubkey,
    vault: Pubkey,
    settlement: Pubkey,
    proof: TransitionProofArgs,
) -> Instruction {
    Instruction {
        program_id: PROGRAM_ID,
        accounts: crate::accounts::ExecuteProvenTransition {
            proposer,
            evaluator,
            position,
            vault,
            settlement,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: crate::instruction::ExecuteProvenTransition { proof }.data(),
    }
}

fn proof(
    svm: &LiteSVM,
    covenant_hash: [u8; 32],
    destination: Pubkey,
    nonce: u64,
    position_version: u64,
) -> TransitionProofArgs {
    let clock = svm.get_sysvar::<Clock>();

    TransitionProofArgs {
        covenant_hash,
        claim_passport_hash: nonzero(2),
        evidence_root: nonzero(3),
        pre_state_hash: nonzero(4),
        proposed_post_state_hash: nonzero(5),
        receipt_hash: nonzero(6),
        position_version,
        nonce,
        expiry_unix: clock.unix_timestamp + 120,
        operator: OPERATOR_ACQUIRE,
        economic_value_usd_micros: 50_000_000,
        settlement_amount_lamports: TRANSITION_AMOUNT,
        destination,
    }
}

fn read_position(svm: &LiteSVM, address: &Pubkey) -> crate::Position {
    let account = svm
        .get_account(address)
        .expect("position account must exist");
    let mut data = account.data.as_slice();
    crate::Position::try_deserialize(&mut data)
        .expect("position should deserialize")
}

fn current_version_nonce(fx: &Fixture) -> (u64, u64) {
    let position = read_position(&fx.svm, &fx.position);
    (position.position_version, position.nonce)
}

fn setup() -> Fixture {
    let mut svm = LiteSVM::new();
    let program_bytes =
        include_bytes!("../../../target/deploy/covenant_runtime.so");
    svm.add_program(PROGRAM_ID, program_bytes);

    let owner = Keypair::new();
    let evaluator = Keypair::new();
    let proposer = Keypair::new();
    let settlement = Keypair::new();

    for key in [
        owner.pubkey(),
        evaluator.pubkey(),
        proposer.pubkey(),
        settlement.pubkey(),
    ] {
        svm.airdrop(&key, 2 * LAMPORTS_PER_SOL)
            .expect("airdrop should succeed");
    }

    let position_id = nonzero(9);
    let covenant_hash = nonzero(1);
    let (position, _) = Pubkey::find_program_address(
        &[
            b"position",
            owner.pubkey().as_ref(),
            position_id.as_ref(),
        ],
        &PROGRAM_ID,
    );
    let (vault, _) =
        Pubkey::find_program_address(&[b"vault", position.as_ref()], &PROGRAM_ID);

    let ix = initialize_ix(
        owner.pubkey(),
        position,
        position_id,
        covenant_hash,
        evaluator.pubkey(),
    );
    send(&mut svm, &owner, &[ix], &[])
        .expect("position initialization should succeed");

    let ix = deposit_ix(owner.pubkey(), position, vault);
    send(&mut svm, &owner, &[ix], &[])
        .expect("vault deposit should succeed");

    let position_state = read_position(&svm, &position);
    assert_eq!(position_state.position_id, position_id);
    assert_eq!(position_state.position_version, 1);
    assert_eq!(position_state.nonce, 1);

    Fixture {
        svm,
        owner,
        evaluator,
        proposer,
        settlement,
        position,
        vault,
        position_id,
        covenant_hash,
    }
}

#[test]
fn allowed_proof_moves_real_value_and_replay_fails() {
    let mut fx = setup();
    let settlement_before = fx
        .svm
        .get_account(&fx.settlement.pubkey())
        .expect("settlement exists")
        .lamports;
    let vault_before = fx
        .svm
        .get_account(&fx.vault)
        .expect("vault exists")
        .lamports;
    let (version, nonce) = current_version_nonce(&fx);

    let proof = proof(
        &fx.svm,
        fx.covenant_hash,
        fx.settlement.pubkey(),
        nonce,
        version,
    );
    let ix = transition_ix(
        fx.proposer.pubkey(),
        fx.evaluator.pubkey(),
        fx.position,
        fx.vault,
        fx.settlement.pubkey(),
        proof.clone(),
    );

    send(
        &mut fx.svm,
        &fx.proposer,
        &[ix.clone()],
        &[&fx.evaluator],
    )
    .expect("ALLOW proof should move value");

    let settlement_after = fx
        .svm
        .get_account(&fx.settlement.pubkey())
        .expect("settlement exists")
        .lamports;
    let vault_after = fx
        .svm
        .get_account(&fx.vault)
        .expect("vault exists")
        .lamports;

    assert_eq!(
        settlement_after - settlement_before,
        TRANSITION_AMOUNT
    );
    assert_eq!(vault_before - vault_after, TRANSITION_AMOUNT);

    let position = read_position(&fx.svm, &fx.position);
    assert_eq!(position.nonce, nonce + 1);
    assert_eq!(position.position_version, version + 1);
    assert_eq!(position.last_receipt_hash, proof.receipt_hash);

    let replay = send(
        &mut fx.svm,
        &fx.proposer,
        &[ix],
        &[&fx.evaluator],
    );
    assert!(replay.is_err(), "consumed proof must not replay");

    let settlement_after_replay = fx
        .svm
        .get_account(&fx.settlement.pubkey())
        .expect("settlement exists")
        .lamports;
    assert_eq!(settlement_after_replay, settlement_after);
}

#[test]
fn wrong_evaluator_and_destination_substitution_cannot_move_value() {
    let mut fx = setup();
    let wrong_evaluator = Keypair::new();
    let other_settlement = Keypair::new();

    fx.svm
        .airdrop(&wrong_evaluator.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();
    fx.svm
        .airdrop(&other_settlement.pubkey(), LAMPORTS_PER_SOL)
        .unwrap();

    let expected_settlement_before = fx
        .svm
        .get_account(&fx.settlement.pubkey())
        .unwrap()
        .lamports;
    let other_before = fx
        .svm
        .get_account(&other_settlement.pubkey())
        .unwrap()
        .lamports;
    let (version, nonce) = current_version_nonce(&fx);

    let exact_proof = proof(
        &fx.svm,
        fx.covenant_hash,
        fx.settlement.pubkey(),
        nonce,
        version,
    );

    let wrong_evaluator_ix = transition_ix(
        fx.proposer.pubkey(),
        wrong_evaluator.pubkey(),
        fx.position,
        fx.vault,
        fx.settlement.pubkey(),
        exact_proof.clone(),
    );
    assert!(
        send(
            &mut fx.svm,
            &fx.proposer,
            &[wrong_evaluator_ix],
            &[&wrong_evaluator],
        )
        .is_err(),
        "unbound evaluator must fail"
    );

    let substituted_destination_ix = transition_ix(
        fx.proposer.pubkey(),
        fx.evaluator.pubkey(),
        fx.position,
        fx.vault,
        other_settlement.pubkey(),
        exact_proof,
    );
    assert!(
        send(
            &mut fx.svm,
            &fx.proposer,
            &[substituted_destination_ix],
            &[&fx.evaluator],
        )
        .is_err(),
        "destination substitution must fail"
    );

    assert_eq!(
        fx.svm
            .get_account(&fx.settlement.pubkey())
            .unwrap()
            .lamports,
        expected_settlement_before
    );
    assert_eq!(
        fx.svm
            .get_account(&other_settlement.pubkey())
            .unwrap()
            .lamports,
        other_before
    );
    assert_eq!(read_position(&fx.svm, &fx.position).nonce, nonce);
}

#[test]
fn freeze_is_an_onchain_kill_switch_and_invalidates_pending_proof() {
    let mut fx = setup();
    let settlement_before = fx
        .svm
        .get_account(&fx.settlement.pubkey())
        .unwrap()
        .lamports;
    let (version, nonce) = current_version_nonce(&fx);
    let pending_proof = proof(
        &fx.svm,
        fx.covenant_hash,
        fx.settlement.pubkey(),
        nonce,
        version,
    );

    let freeze = freeze_ix(fx.owner.pubkey(), fx.position);
    send(&mut fx.svm, &fx.owner, &[freeze], &[])
        .expect("owner should freeze position");

    let frozen_state = read_position(&fx.svm, &fx.position);
    assert!(frozen_state.frozen);
    assert_eq!(frozen_state.position_version, version + 1);
    assert_eq!(frozen_state.nonce, nonce + 1);

    let ix = transition_ix(
        fx.proposer.pubkey(),
        fx.evaluator.pubkey(),
        fx.position,
        fx.vault,
        fx.settlement.pubkey(),
        pending_proof,
    );

    assert!(
        send(&mut fx.svm, &fx.proposer, &[ix], &[&fx.evaluator])
            .is_err(),
        "frozen position must refuse execution"
    );

    assert_eq!(
        fx.svm
            .get_account(&fx.settlement.pubkey())
            .unwrap()
            .lamports,
        settlement_before
    );
}

#[test]
fn covenant_amendment_preserves_position_identity_and_kills_old_proof() {
    let mut fx = setup();
    let original_position = fx.position;
    let original_position_id = fx.position_id;
    let (version, nonce) = current_version_nonce(&fx);

    let old_proof = proof(
        &fx.svm,
        fx.covenant_hash,
        fx.settlement.pubkey(),
        nonce,
        version,
    );

    let new_covenant_hash = nonzero(7);
    let amend = amend_covenant_ix(
        fx.owner.pubkey(),
        fx.position,
        new_covenant_hash,
    );
    send(&mut fx.svm, &fx.owner, &[amend], &[])
        .expect("owner should amend Covenant");

    let amended = read_position(&fx.svm, &fx.position);
    assert_eq!(fx.position, original_position);
    assert_eq!(amended.position_id, original_position_id);
    assert_eq!(amended.covenant_hash, new_covenant_hash);
    assert_eq!(amended.position_version, version + 1);
    assert_eq!(amended.nonce, nonce + 1);

    let old_ix = transition_ix(
        fx.proposer.pubkey(),
        fx.evaluator.pubkey(),
        fx.position,
        fx.vault,
        fx.settlement.pubkey(),
        old_proof,
    );
    assert!(
        send(&mut fx.svm, &fx.proposer, &[old_ix], &[&fx.evaluator])
            .is_err(),
        "proof bound to prior Covenant/version must fail"
    );

    let new_proof = proof(
        &fx.svm,
        new_covenant_hash,
        fx.settlement.pubkey(),
        amended.nonce,
        amended.position_version,
    );
    let new_ix = transition_ix(
        fx.proposer.pubkey(),
        fx.evaluator.pubkey(),
        fx.position,
        fx.vault,
        fx.settlement.pubkey(),
        new_proof,
    );
    send(
        &mut fx.svm,
        &fx.proposer,
        &[new_ix],
        &[&fx.evaluator],
    )
    .expect("fresh proof under amended Covenant should execute");
}
