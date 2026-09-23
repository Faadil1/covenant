# COVENANT

**Protected tokenized-stock ownership.**

COVENANT is a user application for people who want stock exposure on Solana without having to understand which token representation is currently acceptable.

For the Stocklana demo, the user promise is simple:

> **Protect my Apple position. Only use representations that satisfy my rules, and do not give software authority to act unless the exact action still keeps me protected.**

The engine underneath checks exact representation identity, user-specific eligibility, market evidence, protection rules and bounded execution authority.

## User experience

```
Choose Apple
   ↓
Set protection rules
   ↓
Current representation stops fitting
   ↓
Find candidate representation
   ↓
Check rule fit
   ↓
Check user eligibility
   ↓
Check exact route
   ↓
SAFE SWITCH / SAFE NO ACTION
   ↓
one exact authorization only if every gate passes
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
| Objective AAPLx / AAPLon mint-control difference | PASS | mainnet run `35884969091`, artifact `10761673239` |
| Deterministic protection decision | PASS | ALLOW / ESCALATE / REFUSE engine |
| Governed USDC -> AAPLx execution | PASS | Surfpool run `35698743841` |
| Replay rejection | PASS | same T3 run |
| AAPLx -> AAPLon representation switch | PASS | historical governed migration run `35733746142`, artifact `10696822718` |
| Current Apple repair revalidation | PASS · SAFE NO ACTION | run `35886284296`, route 977.23 bps > owner ceiling 500 bps, artifact `10762099429` |
| Live Pyth TSLA + Jupiter TSLAx gate | PASS | run `35794379825` |
| Minimal Solana authority canary build | PASS | 34,112 bytes · ~0.1739392 SOL devnet rent |
| Full COVENANT mainnet deployment | NOT CLAIMED | preflight only |

The Tesla path is **evidence fallback only** while the current Pyth trial lacks Apple feed entitlement. It is not a second user story.

### Canonical judge protection event

The primary browser journey is now the current Apple repair decision, not the historical migration:

```
AAPLx
  → rule mismatch: PermanentDelegate active
  → candidate: AAPLon fits the selected representation rule
  → profile gate: Canada / Québec not eligible
  → route gate: 977.23 bps > 500 bps ceiling
  → SAFE NO ACTION
```

This is intentional. The historical governed AAPLx → AAPLon migration remains execution proof, while the current user journey re-evaluates the present profile and point-in-time route before creating any authority. A candidate representation is not treated as usable merely because it fits the ownership rule.

## Cryptographic scope

COVENANT does **not** claim ZK or formal verification.

The internal `TransitionProofArgs` is an evidence/authorization packet. SHA-256 commitments bind the Covenant, representation, evidence, exact action and resulting state. The evaluator signer plus Solana program independently enforce version, nonce, expiry, operator, amount cap and execution material before authority can be consumed.

Public wording uses **evidence-bound authorization**.

## Run

```bash
npm run test:t2
npm run probe:apple-reality
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


## Representation reality boundary

The canonical Apple protection event now uses an **objective onchain mint-control difference**, not a missing-data comparison.

A mainnet Token-2022 inspection of the exact mints found:

- **AAPLx:** active `PermanentDelegate` at `5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq`;
- **AAPLon:** no `PermanentDelegate` extension.

The Stocklana demo rule is therefore concrete: **do not use a representation with an active permanent token-moving delegate**. Under Solana Token-2022 semantics, a permanent delegate is a mint-level authority that can authorize transfers and burns for any token account of that mint, and token-account owners cannot revoke it.

This is not a claim that AAPLx is universally unsafe or AAPLon universally superior. Both representations have other issuer controls. COVENANT evaluates whether an exact representation satisfies the owner's explicit rule.

Eligibility is evaluated separately from representation identity. A technically valid representation can still be unusable for a particular person, jurisdiction, venue or operation. `UNKNOWN` and `INELIGIBLE` both refuse.

Mainnet inspection: workflow run `35884969091`, artifact `10761673239`.

A second issuer-term difference is now bound from official docs:

- xStocks direct issuer issuance/redemption minimum: **$5,000**;
- Ondo Stocks minimum investment/redemption amount: **$1**.

This supports a separate owner rule for small-holder direct-redemption access. Passing that rule still does not establish user eligibility.

For a Canada/Quebec profile, current issuer evidence now refuses both AAPLx and AAPLon acquisition/redemption. COVENANT therefore must not represent the Apple switch as executable for a Canadian user.

See `research/REPRESENTATION-REALITY-AUDIT-V1.md` and `docs/APPLE-SMALL-HOLDER-REDEMPTION-PROOF.md`.
