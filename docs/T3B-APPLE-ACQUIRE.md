# T3b — Exact Apple ACQUIRE Boundary

Status: **DESIGN LOCK — implementation follows T3a**

T3a proves that COVENANT can withhold PDA-controlled authority unless an exact proof packet matches the current Covenant state. T3b converts that generic state-changing boundary into the canonical Stocklana economic transition:

```
USDC in Position Vault
  -> exact Apple Claim
  -> exact Position-owned Token-2022 account
```

The execution adapter must never become a generic "call arbitrary Jupiter instruction" escape hatch.

## Current execution primitive

Use Jupiter's current **Swap API V2 /build** path for custom transaction construction rather than treating deprecated Metis V1 as the canonical integration.

The build response is offchain routing material, not authority. COVENANT must independently bind and constrain it.

## Required proof commitment

An executable ACQUIRE proof must commit at minimum to:

- `position_id`
- current `position_version`
- current `nonce`
- `covenant_hash`
- exact `claim_passport_hash` + version
- `evidence_root`
- input mint = canonical USDC
- exact input amount
- output mint = exact qualifying Apple claim mint
- minimum acceptable output
- maximum input where applicable
- Jupiter swap program id
- ordered swap accounts commitment
- swap instruction-data commitment
- lookup-table/address-set commitment when used
- pre-state hash
- proposed post-state hash
- quote/evidence expiry
- receipt commitment

The evaluator may propose and sign this packet only after T2 returns `ALLOW`.

## Program-side invariants

Before CPI:

1. Position PDA identity is canonical.
2. Position is not frozen.
3. Evaluator signer is the owner-selected evaluator.
4. Covenant hash, version, nonce and expiry match current state.
5. Operator is `ACQUIRE` and inside delegated authority.
6. Input token account is owned by the Position PDA.
7. Input mint is the configured settlement asset.
8. Output token account is owned by the Position PDA.
9. Output mint is the exact Claim Passport mint.
10. Jupiter program id is explicitly allowlisted.
11. CPI account/data commitment matches the evaluator-approved execution commitment.

After CPI:

1. Measure input-account balance delta.
2. Measure output-account balance delta.
3. Refuse/rollback the transaction unless input spend is inside the proof bound.
4. Refuse/rollback unless output delta is at least `min_out`.
5. Advance position version + nonce atomically.
6. Store the receipt commitment.
7. Emit the settlement event with exact mint/amount deltas.

Because all CPIs occur in one Solana transaction, a postcondition failure reverts the economic transition rather than leaving a "successful trade + failed audit" state.

## Route truth

Keep these concepts separate:

- **requested slippage tolerance** — execution guard supplied to routing;
- **Jupiter price impact** — route liquidity/execution-quality evidence;
- **Pyth/reference basis** — tokenized claim versus independent reference evidence;
- **Claim semantics** — issuer/rights/lifecycle evidence.

No one field may stand in for another.

## Fork-first proof

The next integration environment should be Surfpool/mainnet-fork because the Apple claims and actual Jupiter liquidity live on mainnet. The goal is to clone/fetch the exact route accounts and execute the same CPI logic against mainnet-shaped state without using real funds.

Canonical proof sequence:

```
1. create stable Invariant Position PDA
2. seed Position-owned USDC in fork
3. collect current Claim Passport + live route
4. T2 -> ALLOW
5. build exact execution commitment
6. T3b program CPI executes USDC -> qualifying Apple claim
7. verify token balance deltas + receipt
8. replay exact proof -> REFUSE
9. mutate evidence/version/quote freshness
10. same economic intent proposes transition again
11. T2 -> REFUSE or new proof requires alternate claim
12. governed executor cannot move funds on refused path
```

## Mainnet safeguard

A mainnet financial transaction is not required to develop or validate this adapter. If a final tiny-value mainnet proof is later desired, it must be a separate explicit operator decision with:

- explicit network guard;
- hard notional cap;
- fresh proof;
- no repository/private-key secret;
- preflight simulation;
- exact expected output mint;
- immediate receipt capture.

Until then, `mainnet execution = disabled`.

## T3 completion standard

T3 is closed only when the repository contains reproducible evidence of:

```
ALLOW
 -> exact proof
 -> governed path
 -> real fork/devnet/mainnet state change
 -> receipt

REFUSE
 -> same governed path
 -> no economic state change
```

A passing policy unit test alone is T2. A generic PDA transfer is T3a. The exact Apple ACQUIRE path is T3b and is the Stocklana technical gate.
