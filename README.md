# COVENANT

**Protected tokenized-stock ownership.**

COVENANT is a user application for people who want stock exposure on Solana without having to understand which token representation is currently acceptable.

For the Stocklana demo, the user promise is simple:

> **Protect my Apple position. Only use representations that satisfy my rules, and do not give software authority to act unless the exact action still keeps me protected.**

The engine underneath checks exact representation identity, market evidence, user protection rules and bounded execution authority.

## User experience

```
Choose Apple
   ↓
Set protection rules
   ↓
Compare AAPLx / AAPLon
   ↓
PROTECTED / BLOCKED / REVIEW NEEDED
   ↓
one exact authorization
   ↓
Solana execution boundary
```

The judge-facing app exposes:

- **Portfolio** — the protected Apple position;
- **Protection** — human-readable rules such as verified issuers, route-impact limit and automation cap;
- **Representations** — AAPLx vs AAPLon under those rules;
- **Check** — a complete end-to-end protection decision;
- **Evidence** — the technical execution and market evidence underneath.

## Why this is different from a wallet policy

A wallet policy asks whether an actor may sign.

COVENANT asks whether the **resulting stock position still satisfies what the owner asked to hold**, then creates authority for that exact action only.

The user does not need to understand Claim Passports, PDAs, nonces or commitments. Those remain implementation details under “Why this action is safe.”

## Verified technical evidence

| Boundary | Status | Evidence |
| --- | --- | --- |
| Exact AAPLx / AAPLon identities | PASS | official issuer + Solana RPC |
| Deterministic protection decision | PASS | ALLOW / ESCALATE / REFUSE engine |
| Governed USDC -> AAPLx execution | PASS | Surfpool run `35698743841` |
| Replay rejection | PASS | same T3 run |
| AAPLx -> AAPLon representation switch | PASS | run `35733746142`, artifact `10696822718` |
| Live Pyth TSLA + Jupiter TSLAx gate | PASS | run `35794379825` |
| Minimal Solana authority canary build | PASS | 34,112 bytes · ~0.1739392 SOL devnet rent |
| Full COVENANT mainnet deployment | NOT CLAIMED | preflight only |

The Tesla path is **evidence fallback only** while the current Pyth trial lacks Apple feed entitlement. It is not a second user story.

## Cryptographic scope

COVENANT does **not** claim ZK or formal verification.

The internal `TransitionProofArgs` is an evidence/authorization packet. SHA-256 commitments bind the Covenant, representation, evidence, exact action and resulting state. The evaluator signer plus Solana program independently enforce version, nonce, expiry, operator, amount cap and execution material before authority can be consumed.

Public wording uses **evidence-bound authorization**.

## Run

```bash
npm run test:t2
npm run probe:tsla-fallback
npm run preflight:tsla-mainnet
```

The browser app is a local sandbox. Verified fork execution and live-market evidence are linked under Evidence. No full mainnet COVENANT execution is claimed.

## Repository map

- `demo/` — Stocklana user application
- `src/policy/evaluator.mjs` — protection decision engine
- `src/evidence/` — market and representation evidence
- `src/execution/` — exact execution commitments
- `anchor/programs/covenant_runtime/` — Solana authority boundary
- `canary/` — minimal public authority canary
- `fixtures/passports/` — exact representation records
- `scripts/` — reproducible evidence harnesses
