# COVENANT

**The programmable runtime for economic ownership.**

> Tokens are implementations. Economic intent is the interface.

COVENANT authorizes **proof-carrying economic state transitions**. A user owns an economic intention expressed as an Invariant Position; an agent may only cause a transition when the exact proposed post-state satisfies a versioned Covenant against versioned Claim Passport data, live evidence, portfolio postconditions, and bounded authority.

## Stocklana technical proof

Current build gate: **T1–T3 before UI polish**.

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

This repository was initialized on 2026-09-22 for the Stocklana proof wedge. The first code path is an evidence probe, not a UI.
