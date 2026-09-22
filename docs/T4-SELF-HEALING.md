# T4 Self-Healing / Representation Mobility

Status: **IMPLEMENTED — Surfpool proof workflow enabled**

This vertical slice proves a representation-level repair without pretending that two tokens referencing AAPL are interchangeable.

## Scenario

The stable Invariant Position is `APPLE economic exposure`.

The Position begins with a real AAPLx Token-2022 balance. The owner imports that already-held balance with `adopt_existing_claim`; this moves no value and verifies that the exact token account is owned by the Position PDA.

A rights-sensitive Covenant requires:

- official issuer mapping;
- Token-2022 identity;
- evidence that lending of backing securities requires holder opt-in;
- exact repair route impact ≤ 500 bps.

Under the bound Claim Passports:

- AAPLx has `collateralLendingRequiresHolderOptIn = UNKNOWN`, so the required rule fails closed;
- AAPLon has authoritative issuer evidence for explicit holder consent;
- the direct AAPLx → AAPLon Jupiter route must also satisfy the live repair-impact rule.

If AAPLon qualifies, the repair planner returns `MIGRATE`, but that plan is still non-executable until a fresh Transition Proof binds the exact route.

## Governed migration

The onchain `execute_claim_migrate` instruction requires:

- operator = MIGRATE;
- source mint = Position.current_claim_mint;
- source and target accounts are Position-owned Token-2022 accounts;
- target mint = proof target;
- target differs from source;
- the **entire** current-Claim balance is consumed;
- exact Jupiter V6 invocation hash/account order/data match the proof;
- exact source amount and minimum target output are satisfied;
- nonce/version advance atomically;
- current_claim_mint changes only after settlement;
- replay fails.

This makes representation mobility a state transition, not a dashboard recommendation.

## Truth boundary

The proof does not claim that AAPLx changed its legal terms during the run. It uses the currently bound truth: the required holder-opt-in property is UNKNOWN for AAPLx and authoritative TRUE for AAPLon.

The route and economic migration are live-mainnet-shaped inputs/execution on Surfpool. No real mainnet funds are used.

The 500 bps repair bound is intentionally distinct from the 50 bps Stocklana ACQUIRE profile. It is a demo/repair policy, not a recommendation about acceptable trading cost.
