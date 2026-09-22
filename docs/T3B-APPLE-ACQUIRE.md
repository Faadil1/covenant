# T3b — Exact Apple ACQUIRE Boundary

Status: **PASS — exact proof-gated USDC → AAPLx execution verified on a Surfpool mainnet-shaped fork**

T3a proves that COVENANT can withhold PDA-controlled authority unless an exact proof packet matches the current Covenant state. T3b converts that generic state-changing boundary into the canonical Stocklana economic transition:

```
USDC in Position Vault
  -> exact Apple Claim
  -> exact Position-owned Token-2022 account
```

The execution adapter must never become a generic "call arbitrary Jupiter instruction" escape hatch.

## Current execution target

Time-bound route evidence captured in GitHub Actions on 2026-09-22T06:31:32Z compared the four exact Apple/NVIDIA claims at a $100 notional under a 50 bps price-impact rule:

- AAPLx: 0.0971 bps via Raydium CLMM — PASS.
- AAPLon: 481.31 bps via Meteora DLMM — REFUSE under this rule.
- NVDAx: 0.3797 bps via Whirlpool — PASS.
- NVDAon: 6029.78 bps via Manifest — REFUSE under this rule.

This does not rank issuers or claim quality in general. It selects the current T3b execution fixture. **AAPLx is the canonical ACQUIRE target for the fork proof** because it preserves the preferred Apple multi-representation story while supplying the strongest observed secondary execution path. AAPLon remains a truthful alternative Claim Graph node and a live REFUSE case when the route violates the Covenant.

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

## Fork proof result

GitHub Actions run `35698743841` completed the canonical proof on 2026-09-22. At authorization time:

- AAPLx live price impact was `19.977864498792208 bps`, below the Covenant ceiling of `50 bps`, so T2 returned `ALLOW`.
- AAPLon live price impact was `471.29142825340807 bps`, above the same ceiling, so T2 returned `REFUSE` and no executable proof was created.
- the AAPLx proof committed exact input/output mints, `100000000` raw USDC input, `29188074` raw minimum output, the Jupiter CPI invocation hash and evidence/Claim Passport/Covenant state.
- execution settled `29334103` raw AAPLx units, advanced position version and nonce to `1/1`, and persisted the receipt commitment.
- replay of the consumed proof failed with `PositionVersionMismatch` and left balances unchanged.

Jupiter returned one setup instruction because its mainnet builder cannot observe the fork-only Position token accounts. The harness did **not** execute that setup instruction; the exact Position-owned USDC and AAPLx accounts were pre-created in the fork and independently verified by COVENANT before CPI.

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

## T3 completion standard — satisfied

T3 is closed for the Stocklana proof wedge because the repository and run artifact now contain reproducible evidence of:

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

A passing policy unit test alone is T2. A generic PDA transfer is T3a. The exact Apple ACQUIRE path is T3b; that Stocklana technical gate is now closed on the mainnet-shaped fork.

This does **not** claim mainnet financial execution. Mainnet remains a separately guarded operator decision.
