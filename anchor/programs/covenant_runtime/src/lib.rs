use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("CEKUNCY7VYeHdwyyWCJTKQkGgMzPeTsx2uwBoQ98wm3z");

#[cfg(test)]
mod tests;

#[program]
pub mod covenant_runtime {
    use super::*;

    pub fn initialize_position(
        ctx: Context<InitializePosition>,
        covenant_hash: [u8; 32],
        evaluator: Pubkey,
        max_transition_lamports: u64,
        allowed_operator_mask: u16,
    ) -> Result<()> {
        require!(max_transition_lamports > 0, CovenantError::InvalidAmount);
        require!(allowed_operator_mask != 0, CovenantError::NoOperatorsAllowed);

        let position = &mut ctx.accounts.position;
        position.owner = ctx.accounts.owner.key();
        position.evaluator = evaluator;
        position.covenant_hash = covenant_hash;
        position.position_version = 0;
        position.nonce = 0;
        position.max_transition_lamports = max_transition_lamports;
        position.allowed_operator_mask = allowed_operator_mask;
        position.frozen = false;
        position.last_receipt_hash = [0u8; 32];
        position.bump = ctx.bumps.position;

        let (_, vault_bump) = Pubkey::find_program_address(
            &[b"vault", position.key().as_ref()],
            ctx.program_id,
        );
        position.vault_bump = vault_bump;

        emit!(PositionInitialized {
            position: position.key(),
            owner: position.owner,
            evaluator,
            covenant_hash,
            max_transition_lamports,
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

        emit!(PositionFunded {
            position: ctx.accounts.position.key(),
            amount,
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
    ) -> Result<()> {
        let clock = Clock::get()?;
        let position = &mut ctx.accounts.position;

        require!(!position.frozen, CovenantError::PositionFrozen);
        require_keys_eq!(
            ctx.accounts.evaluator.key(),
            position.evaluator,
            CovenantError::WrongEvaluator
        );
        require!(
            proof.covenant_hash == position.covenant_hash,
            CovenantError::CovenantVersionMismatch
        );
        require!(
            proof.position_version == position.position_version,
            CovenantError::PositionVersionMismatch
        );
        require!(proof.nonce == position.nonce, CovenantError::NonceMismatch);
        require!(
            proof.expiry_unix >= clock.unix_timestamp,
            CovenantError::ProofExpired
        );
        require!(
            proof.amount > 0 && proof.amount <= position.max_transition_lamports,
            CovenantError::AmountOutsideAuthority
        );
        require_keys_eq!(
            proof.destination,
            ctx.accounts.settlement.key(),
            CovenantError::DestinationMismatch
        );

        let operator_bit = 1u16
            .checked_shl(u32::from(proof.operator))
            .ok_or(CovenantError::OperatorNotAllowed)?;
        require!(
            operator_bit & position.allowed_operator_mask != 0,
            CovenantError::OperatorNotAllowed
        );

        // Bind the exact evaluator-approved proof to this state transition.
        // Zero hashes are never accepted because they would erase provenance.
        require!(proof.claim_passport_hash != [0u8; 32], CovenantError::ZeroProofField);
        require!(proof.evidence_root != [0u8; 32], CovenantError::ZeroProofField);
        require!(proof.pre_state_hash != [0u8; 32], CovenantError::ZeroProofField);
        require!(
            proof.proposed_post_state_hash != [0u8; 32],
            CovenantError::ZeroProofField
        );
        require!(proof.receipt_hash != [0u8; 32], CovenantError::ZeroProofField);

        require!(
            ctx.accounts.vault.lamports() >= proof.amount,
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
            proof.amount,
        )?;

        let consumed_nonce = position.nonce;
        position.nonce = position
            .nonce
            .checked_add(1)
            .ok_or(CovenantError::ArithmeticOverflow)?;
        position.position_version = position
            .position_version
            .checked_add(1)
            .ok_or(CovenantError::ArithmeticOverflow)?;
        position.last_receipt_hash = proof.receipt_hash;

        emit!(TransitionExecuted {
            position: position.key(),
            proposer: ctx.accounts.proposer.key(),
            evaluator: ctx.accounts.evaluator.key(),
            operator: proof.operator,
            amount: proof.amount,
            destination: proof.destination,
            nonce: consumed_nonce,
            new_position_version: position.position_version,
            covenant_hash: proof.covenant_hash,
            claim_passport_hash: proof.claim_passport_hash,
            evidence_root: proof.evidence_root,
            receipt_hash: proof.receipt_hash,
        });

        Ok(())
    }

    pub fn freeze(ctx: Context<OwnerControl>) -> Result<()> {
        ctx.accounts.position.frozen = true;
        emit!(PositionFrozen {
            position: ctx.accounts.position.key(),
            owner: ctx.accounts.owner.key(),
        });
        Ok(())
    }

    pub fn unfreeze(ctx: Context<OwnerControl>) -> Result<()> {
        ctx.accounts.position.frozen = false;
        emit!(PositionUnfrozen {
            position: ctx.accounts.position.key(),
            owner: ctx.accounts.owner.key(),
        });
        Ok(())
    }

    pub fn rotate_evaluator(
        ctx: Context<OwnerControl>,
        new_evaluator: Pubkey,
    ) -> Result<()> {
        require!(new_evaluator != Pubkey::default(), CovenantError::InvalidEvaluator);
        let old_evaluator = ctx.accounts.position.evaluator;
        ctx.accounts.position.evaluator = new_evaluator;
        ctx.accounts.position.nonce = ctx
            .accounts
            .position
            .nonce
            .checked_add(1)
            .ok_or(CovenantError::ArithmeticOverflow)?;

        emit!(EvaluatorRotated {
            position: ctx.accounts.position.key(),
            old_evaluator,
            new_evaluator,
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
    pub position_version: u64,
    pub nonce: u64,
    pub expiry_unix: i64,
    pub operator: u8,
    pub amount: u64,
    pub destination: Pubkey,
}

#[account]
pub struct Position {
    pub owner: Pubkey,
    pub evaluator: Pubkey,
    pub covenant_hash: [u8; 32],
    pub position_version: u64,
    pub nonce: u64,
    pub max_transition_lamports: u64,
    pub allowed_operator_mask: u16,
    pub frozen: bool,
    pub last_receipt_hash: [u8; 32],
    pub bump: u8,
    pub vault_bump: u8,
}

impl Position {
    pub const SPACE: usize = 157;
}

#[derive(Accounts)]
#[instruction(covenant_hash: [u8; 32])]
pub struct InitializePosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + Position::SPACE,
        seeds = [b"position", owner.key().as_ref(), covenant_hash.as_ref()],
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
        has_one = owner,
        seeds = [b"position", owner.key().as_ref(), position.covenant_hash.as_ref()],
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

    #[account(mut)]
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
pub struct OwnerControl<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner,
        seeds = [b"position", owner.key().as_ref(), position.covenant_hash.as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, Position>,
}

#[event]
pub struct PositionInitialized {
    pub position: Pubkey,
    pub owner: Pubkey,
    pub evaluator: Pubkey,
    pub covenant_hash: [u8; 32],
    pub max_transition_lamports: u64,
    pub allowed_operator_mask: u16,
}

#[event]
pub struct PositionFunded {
    pub position: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TransitionExecuted {
    pub position: Pubkey,
    pub proposer: Pubkey,
    pub evaluator: Pubkey,
    pub operator: u8,
    pub amount: u64,
    pub destination: Pubkey,
    pub nonce: u64,
    pub new_position_version: u64,
    pub covenant_hash: [u8; 32],
    pub claim_passport_hash: [u8; 32],
    pub evidence_root: [u8; 32],
    pub receipt_hash: [u8; 32],
}

#[event]
pub struct PositionFrozen {
    pub position: Pubkey,
    pub owner: Pubkey,
}

#[event]
pub struct PositionUnfrozen {
    pub position: Pubkey,
    pub owner: Pubkey,
}

#[event]
pub struct EvaluatorRotated {
    pub position: Pubkey,
    pub old_evaluator: Pubkey,
    pub new_evaluator: Pubkey,
    pub new_nonce: u64,
}

#[error_code]
pub enum CovenantError {
    #[msg("Transition amount is invalid")]
    InvalidAmount,
    #[msg("At least one transition operator must be authorized")]
    NoOperatorsAllowed,
    #[msg("Position is frozen")]
    PositionFrozen,
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
}
