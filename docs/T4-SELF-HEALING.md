# T4 Self-Healing / Representation Mobility

Status: **PASS — migration mechanism verified historically; objective control rule verified on mainnet; live repair remains market-gated**

COVENANT now separates three proof layers instead of pretending one run proves everything.

## Layer 1 — objective representation failure

Canonical mint-control evidence:

- mainnet run: `35884969091`
- artifact: `10761673239`
- observedAt: `2026-09-23T15:54:35.225Z`

Exact Token-2022 mint inspection found:

- **AAPLx:** active `PermanentDelegate`
- **AAPLon:** no `PermanentDelegate` extension

AAPLx permanent delegate:

`5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq`

Solana defines PermanentDelegate as a mint-level authority that can authorize transfers and burns for any token account of that mint; token-account owners cannot revoke it.

The current repair Covenant therefore uses this owner-selected rule:

> **No active permanent token-moving delegate.**

Under the bound Claim Passports:

```
AAPLx.permanentDelegateActive  = true  -> REFUSE
AAPLon.permanentDelegateActive = false -> pass this rule
```

This is an objective onchain difference, not a missing-evidence comparison.

## Layer 2 — representation mobility mechanism

Historical canonical migration run:

- run: `35733746142`
- artifact: `10696822718`
- outcome: `MIGRATED`

That run proved the constrained AAPLx → AAPLon state transition on a Surfpool mainnet-shaped fork:

- full current-Claim balance consumed;
- exact Jupiter invocation bound;
- minimum output enforced;
- Position identity preserved;
- current Claim changed only after settlement;
- Position version / nonce advanced;
- replay refused.

The historical run used the earlier rights-sensitive holder-consent policy. It remains valid evidence for the **migration mechanism**, but it is not retroactively presented as proof of the new PermanentDelegate rule.

## Layer 3 — current live repair gate

Latest revalidation:

- run: `35886284296`
- artifact: `10762099429`
- outcome: `SAFE_NO_ACTION`
- observed route impact: `977.2256517937228 bps`
- owner repair ceiling: `500 bps`

The current T4 harness re-evaluates both representation truth and the live AAPLx → AAPLon route.

A target representation is not enough. The route must also satisfy the owner's repair-cost ceiling.

Current policy:

- exact issuer mapping;
- Token-2022 identity;
- no active PermanentDelegate;
- live repair route impact ≤ 500 bps;
- bounded MIGRATE authority.

In the latest run, AAPLon passed the no-PermanentDelegate rule, but the live route was too expensive. COVENANT correctly produced **SAFE_NO_ACTION**:

- no migration authorization is created;
- no economic transition occurs;
- the expensive route is not used.

If a later route is inside the bound, the same harness continues through the governed migration. The historical migration run proves that execution path.

This means “self-healing” is not “move at any cost.” It is:

> find a qualifying representation **and** prove that the exact repair is currently admissible.

## Governed migration

When every gate passes, the onchain migration path requires:

- operator = MIGRATE;
- source mint = Position.current_claim_mint;
- source and target accounts are Position-owned Token-2022 accounts;
- target mint = proof target;
- target differs from source;
- the entire current-Claim balance is consumed;
- exact Jupiter invocation hash/account order/data match the proof;
- exact source amount and minimum target output are satisfied;
- nonce/version advance atomically;
- current_claim_mint changes only after settlement;
- replay fails.

The evaluator-approved transition is persisted as a nonce-bound authorization before the compact execution transaction.

## Historical verified result — 2026-09-22

The canonical historical migration completed:

- current representation: AAPLx;
- replacement representation: AAPLon;
- live direct route impact: `248.14350341680253 bps`;
- repair ceiling: `500 bps`;
- source balance: `3000000` raw AAPLx;
- minimum target: `29293783` raw AAPLon;
- settled target: `29421175` raw AAPLon;
- source residual: `0`;
- Position version / nonce: `1/1 -> 2/2`;
- Position identity: preserved;
- outcome: `MIGRATED`.

Historical migration proof hash:

`5f8b540ac809a29dd80a409cfa09aa114e8cc34f875bc0bb27e5f14ca60c154e`

## Truth boundary

COVENANT does **not** claim:

- that AAPLx is universally unsafe;
- that AAPLon is universally superior;
- that absence of PermanentDelegate means absence of all issuer controls;
- that the historical migration used the new PermanentDelegate rule;
- that a migration should execute when the current route violates the owner's cost ceiling;
- that any of these Surfpool transactions moved real mainnet funds.

The claim is narrower and inspectable:

> the exact Apple representations differ on a user-selected onchain authority property, and COVENANT only creates transition authority when both the target representation and the exact route satisfy the current Covenant.
