# COVENANT

**The programmable runtime for economic ownership.**

> Tokens are implementations. Economic intent is the interface.

COVENANT authorizes **proof-carrying economic state transitions**. A user owns an economic intention expressed as an Invariant Position; an agent may only cause a transition when the exact proposed post-state satisfies a versioned Covenant against versioned Claim Passport data, live evidence, portfolio postconditions, and bounded authority.

## Stocklana technical proof

Technical proof gate: **T1–T3 PASS on 2026-09-22. The build may now proceed to implementation hardening and UX without weakening the proof boundary.**

- **T1 — Claim Graph reality proof:** verify at least two exact Solana representations of one underlying, with provenance for identity, issuer/structure, market state, and lifecycle state.
- **T2 — Transition proof prototype:** deterministic `ALLOW | ESCALATE | REFUSE`, explicit reason codes, UNKNOWN fail-closed.
- **T3 — Execution boundary proof:** an ALLOW result can enable a real Solana state change while the corresponding REFUSE result cannot execute through the same governed path.

Primary technical-spike underlying: **Apple**.

Candidate claims:
- AAPLx (xStocks / Backed) — exact identity resolved through the official xStocks API and Solana RPC.
- AAPLon (Ondo Stocks) — exact identity resolved through official Ondo source and Solana RPC.

NVIDIA remains the hot fallback if live route quality makes it materially stronger.

## Non-regression

COVENANT is **not** an agent wallet, router, asset-passport dashboard, robo-advisor, or generic policy engine.

Traditional pattern:

```
AUTHORITY -> ACTION -> AUDIT
```

COVENANT:

```
PROPOSE -> PROVE -> AUTHORIZE -> EXECUTE
```

**Proof before power. Authority attaches to the transition, not merely to the wallet.**

## Evidence rule

Every policy-relevant field must carry provenance and freshness. Missing evidence remains `UNKNOWN`. `UNKNOWN` never silently becomes `TRUE`.

## Repository status

**Stocklana technical proof wedge: PASS.**

- T1 resolves a real Apple Claim Graph with AAPLx and AAPLon and live route evidence.
- T2 deterministically produces `ALLOW | ESCALATE | REFUSE` and refuses UNKNOWN evidence.
- T3a proves the PDA-controlled authority boundary in LiteSVM.
- T3b proves an exact proof-gated `USDC -> AAPLx` state transition through Jupiter on a Surfpool mainnet-shaped fork, then rejects replay with unchanged balances.

Canonical T3b evidence: GitHub Actions run `35698743841`, artifact `covenant-t3b-surfpool-evidence`.

This is a fork proof, not a mainnet financial transaction. Mainnet execution remains disabled by default.
