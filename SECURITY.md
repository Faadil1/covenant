# COVENANT Security Model

## Cryptographic scope

COVENANT does not implement zero-knowledge proofs or formal verification. The internal `TransitionProofArgs` structure is an evidence-bound authorization packet. SHA-256 commitments bind exact transition material; an evaluator signature attests the decision; the Solana program independently enforces the stored authority constraints.

The system therefore claims **bounded transition authorization and replay resistance**, not cryptographic proof that arbitrary offchain facts are true.

## Security objective

An autonomous proposer must never gain generic control of Position assets.

Economic authority exists only for an exact transition whose proof matches current Position state, bounded delegated authority, exact execution material and postconditions.

## Trust boundaries

### Owner

Controls:

- initial Position creation;
- Covenant selection/amendment;
- evaluator rotation;
- freeze/unfreeze;
- delegated operator mask;
- autonomous value cap;
- optional representation priorities.

### Evaluator

May attest that one exact proposed transition satisfies the offchain/onchain evidence policy.

The evaluator cannot move Position assets by itself.

### Position PDA

Canonical authority over governed economic state.

The PDA signs inside the COVENANT program only after all onchain checks pass.

### Proposer / agent

May construct proposals and submit transactions.

The proposer does not own the Position authority.

### External execution program

Jupiter V6 is explicitly allowlisted for the Stocklana execution path.

The exact CPI account order, signer/writable flags and instruction data are hash-bound before execution.

## Enforced controls

- stored Covenant hash match;
- evaluator identity match;
- Position version match;
- nonce match;
- proof expiry;
- operator allowlist;
- autonomous economic-value cap;
- nonzero proof fields;
- exact target Claim mint;
- exact input/output mint;
- exact Position-owned token accounts;
- exact token program expectations;
- exact Jupiter program;
- exact Jupiter invocation hash;
- exact input amount;
- minimum output;
- atomic Position state advance;
- replay rejection through nonce/version change;
- explicit owner freeze;
- Covenant amendment invalidation;
- evaluator rotation invalidation.

## Representation migration controls

MIGRATE additionally requires:

- source mint equals `current_claim_mint`;
- target mint differs from source;
- source and target are Token-2022 accounts controlled by the Position;
- full current-Claim balance is consumed;
- target output meets the proof-bound minimum;
- `current_claim_mint` changes only after successful settlement.

A repair plan is non-executable until a fresh proof exists.

## Jupiter setup material

The T4 path encountered ATA setup instructions generated because Jupiter's mainnet builder cannot see fork-only Position accounts.

COVENANT treats setup separately from economic execution:

- only allowlisted non-economic setup programs are accepted;
- setup instructions are materialized before transition authorization;
- source and target economic balances are checked unchanged across setup;
- the actual swap remains proof-bound and separately authorized.

## Replay / stale authority

A successful transition advances Position version and nonce.

Consumed proofs therefore fail on replay.

Already-issued but unconsumed proof exposure is bounded by:

- expiry;
- Position version;
- nonce;
- owner freeze/amendment;
- evaluator rotation.

### Known hardening gap

COVENANT does not yet have an onchain evidence-epoch primitive that instantaneously revokes every still-unexpired proof when an offchain fact changes.

For a production environment requiring sub-expiry revocation, add:

- onchain evidence epoch / root version;
- proof binding to that epoch;
- evaluator or oracle update transaction;
- atomic invalidation of proofs from older epochs.

## Fail-closed policy

Required evidence states:

```
VERIFIED + sufficient class + fresh + rule passes -> ALLOW
UNKNOWN / stale / insufficient class / rule fails   -> REFUSE or explicit ESCALATE
```

There is no UNKNOWN -> TRUE coercion.

## Mainnet boundary

The repository proves constrained behavior on LiteSVM and Surfpool mainnet-shaped forks.

Mainnet financial execution is not enabled or claimed by the Stocklana demo.
