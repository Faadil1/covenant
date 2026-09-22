# COVENANT — Stocklana Submission Pack

## One-line pitch

**COVENANT is the programmable runtime for economic ownership: users define what must remain economically true, and autonomous actors may change token implementations only when the resulting state still satisfies those invariants.**

> Tokens are implementations. Economic intent is the interface.

## Problem

Tokenized equities create a new failure mode: the same economic underlying can appear through different issuers, mints, lifecycle rules, rights semantics and liquidity paths.

A wallet or router can move tokens. It does not prove that the resulting portfolio still represents what the owner intended to own.

Traditional agent pattern:

```
AUTHORITY -> ACTION -> AUDIT
```

COVENANT:

```
PROPOSE -> PROVE -> AUTHORIZE -> EXECUTE
```

Authority is attached to one exact economic state transition, not granted generically to an agent wallet.

## Product primitive

An **Invariant Position** represents stable economic intent.

For the Stocklana proof:

```
Invariant Position
  APPLE ECONOMIC EXPOSURE
       |
       +-- AAPLx  / xStocks / Backed
       |
       +-- AAPLon / Ondo Stocks
```

Each representation has a versioned Claim Passport with exact mint identity, issuer provenance, onchain properties, rights/lifecycle evidence and live route evidence.

The Covenant evaluates those facts plus the proposed post-state and delegated authority.

## What is proven

### T1 — real Claim Graph

Apple has multiple exact Solana Token-2022 representations resolved through issuer/official sources and Solana RPC.

### T2 — deterministic proof decision

The evaluator returns `ALLOW | ESCALATE | REFUSE` with reason codes and evidence provenance.

Required evidence that is missing remains `UNKNOWN`; `UNKNOWN` fails closed.

### T3 — proof before power

Canonical run: `35698743841`.

An exact `USDC -> AAPLx` transition was:

1. proposed;
2. evaluated;
3. bound to a Transition Proof;
4. authorized through the Position PDA;
5. executed through Jupiter on a Surfpool mainnet-shaped fork;
6. verified against postconditions;
7. recorded as a Transition Receipt;
8. replayed and refused with balances unchanged.

### T4 — representation mobility / self-healing

Canonical run: `35733746142`. Artifact ID: `10696822718`.

The same Invariant Position began with AAPLx.

A rights-sensitive Covenant required evidence that collateral lending requires holder opt-in. The bound AAPLx Claim Passport had that fact as `UNKNOWN`, so the current representation failed closed.

AAPLon had authoritative evidence satisfying the property and a live direct Jupiter migration route under the repair Covenant ceiling.

COVENANT then:

```
AAPLx current Claim
  -> REFUSE (EVIDENCE_UNKNOWN)
  -> repair planner: MIGRATE
  -> fresh AAPLon proof
  -> nonce-bound authorization PDA
  -> exact AAPLx -> AAPLon Jupiter CPI
  -> full source consumption
  -> current_claim_mint changes
  -> Position identity preserved
  -> receipt
```

Observed fork result:

- source: `3,000,000` raw AAPLx;
- minimum output: `29,293,783` raw AAPLon;
- settled output: `29,421,175` raw AAPLon;
- direct route price impact: `248.14350341680253 bps`;
- repair ceiling: `500 bps`;
- source residual: `0`;
- version / nonce: `1/1 -> 2/2`;
- Position identity preserved: `true`;
- representation changed: `true`.

### T5 — receipt integrity

The deterministic receipt verifier binds the receipt to the exact:

- proof;
- Covenant;
- Claim Passport;
- evidence root;
- execution commitment;
- settled state;
- transaction reference.

Tampered settled-state evidence fails verification.

## Why Solana is load-bearing

COVENANT uses Solana as the actual economic authority and settlement layer, not as a decorative chain reference.

The proof depends on:

- exact SPL / Token-2022 mint identity;
- Token-2022 account/program properties;
- PDA-controlled Position authority;
- nonce/version state;
- evaluator-bound authorization;
- Jupiter CPI routing;
- atomic post-settlement verification;
- auditable transaction state;
- composable token accounts.

Without the Solana execution boundary, COVENANT would collapse into an offchain policy dashboard.

## Why this is not a router

Routing answers:

> Where can I trade this token?

COVENANT answers:

> Is this exact economic state transition still faithful to the owner's intent, and may authority exist for this exact transition?

The route is only one evidence input.

## Why this is not an agent wallet

An agent wallet owns broad signing power and constrains behavior around that authority.

COVENANT reverses the relationship:

```
No proof -> no transition authority
Exact valid proof -> exact transition authority
Consumed/stale proof -> no authority
```

## Demo truth boundary

The demo contains two verified technical-proof narratives:

1. T3 ACQUIRE — `USDC -> AAPLx`;
2. T4 self-healing — `AAPLx -> AAPLon`.

Both economic executions occurred on Surfpool mainnet-shaped forks. **No mainnet financial transaction is claimed.**

Live quotes and issuer/onchain identity evidence were used by the proof harnesses, while fork-only balances were seeded before authorization.

## Current limitations

- mainnet financial execution remains disabled;
- evidence changes do not yet instantaneously revoke every already-issued unexpired proof; outstanding exposure is bounded by expiry, nonce/version, freeze/amendment and evaluator rotation;
- Claim Passport adapters are narrow and Apple-focused for the Stocklana wedge;
- the 500 bps self-healing route ceiling is a demo/repair Covenant parameter, not investment advice or a universal production threshold.

## Repository evidence map

- `fixtures/passports/` — Claim Passports;
- `src/policy/evaluator.mjs` — deterministic rule engine;
- `src/proof/transition-proof.mjs` — proof + receipt hashing;
- `src/runtime/covenant-runtime.mjs` — PROPOSE -> PROVE orchestration;
- `src/runtime/repair-planner.mjs` — STAY / MIGRATE / FREEZE / ESCALATE;
- `anchor/programs/covenant_runtime` — Position authority and exact execution boundary;
- `scripts/t3b-surfpool-execute.mjs` — verified ACQUIRE proof harness;
- `scripts/t4-self-healing-surfpool.mjs` — verified representation-mobility harness;
- `demo/` — jury-facing product surface.

## Closing line

**Traditional portfolios hold assets. COVENANT holds intentions.**
