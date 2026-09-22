# T4 Self-Healing / Representation Mobility

Status: **PASS — verified proof-gated representation migration on Surfpool**

This vertical slice proves a representation-level repair without pretending that two tokens referencing AAPL are interchangeable.

Canonical run: `35733746142`  
Artifact: `covenant-t4-self-healing-evidence`  
Artifact ID: `10696822718`

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


## Verified result — 2026-09-22

The canonical run completed the full self-healing path:

- current representation: AAPLx;
- current decision: `REFUSE`;
- failure reason: required holder-opt-in lending evidence remained `UNKNOWN`;
- replacement representation: AAPLon;
- replacement decision: `ALLOW`;
- live direct AAPLx → AAPLon route impact: `248.14350341680253 bps`;
- repair Covenant ceiling: `500 bps`;
- source balance: `3000000` raw AAPLx;
- minimum target: `29293783` raw AAPLon;
- settled target: `29421175` raw AAPLon;
- source residual: `0`;
- Position version / nonce: `1/1 -> 2/2`;
- Position identity: preserved;
- representation: changed;
- outcome: `MIGRATED`.

The migration proof hash was `5f8b540ac809a29dd80a409cfa09aa114e8cc34f875bc0bb27e5f14ca60c154e`.

The onchain authorization used a nonce-bound PDA containing the full evaluator-approved Transition Proof before the compact execution transaction. Jupiter setup material was restricted to allowlisted non-economic account-creation instructions, and source/target economic balances were verified unchanged across setup.
