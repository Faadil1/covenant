# COVENANT — Stocklana submission brief

## One line

**COVENANT lets autonomous software change a tokenized asset's representation only when the resulting position still matches the owner's economic rules.**

## The problem

The same underlying stock can exist onchain through different issuers and token representations. A wallet can authorize a signer and a router can find a path, but neither answers whether the resulting representation still preserves what the owner intended to hold.

## The product

For Stocklana, the user says:

> Keep my Apple exposure inside these rules. If the current representation stops qualifying, do not move value unless a fresh exact authorization exists.

COVENANT evaluates the exact representation, fresh evidence and the proposed post-state. It returns `ALLOW | ESCALATE | REFUSE`. Only an ALLOW may become a one-time, evidence-bound authorization.

## What is technically demonstrated

**Apple / depth**

- AAPLx and AAPLon exact identities resolved from official/onchain evidence.
- Deterministic fail-closed evaluation.
- Governed `USDC -> AAPLx` Jupiter execution on a Surfpool mainnet-shaped fork.
- Consumed authorization replay refused.
- `AAPLx -> AAPLon` migration with the same Position identity preserved.

Canonical evidence: T3 run `35698743841`; T4 run `35733746142`, artifact `10696822718`.

**Tesla / live market evidence**

The current Pyth trial is not entitled to AAPL/AAPLx/AAPLon. Instead of faking those feeds, the live fallback uses Pyth TSLA/USD and an executable Jupiter TSLAx quote.

Run `35794379825` passed the real COVENANT evaluator with fresh Pyth + Jupiter evidence.

## What “authorization” means cryptographically

COVENANT is **not a ZK or formal proof system**.

The internal `TransitionProofArgs` name refers to an authorization packet whose fields are hash-bound with SHA-256 commitments. The onchain program then requires the configured evaluator signer and independently checks Covenant hash, Position version, nonce, expiry, operator, value cap, destination/target and exact execution commitment.

The security property is **bounded, evidence-bound authority**, not mathematical proof of offchain truth.

## Why Solana is load-bearing

The Position PDA controls authority. Nonce/version state rejects replay. Exact token identities and Jupiter execution material are checked onchain. Successful settlement advances state atomically.

## Demo boundary

- Browser interaction: local sandbox.
- T3/T4: Surfpool mainnet-shaped fork.
- Tesla fallback: live Pyth + live Jupiter data through the real evaluator.
- Devnet canary: public Solana authority-boundary transaction and replay refusal.
- Full mainnet COVENANT execution: not claimed.

## Primary sponsor fit

The strongest Stocklana sponsor fit is Pyth: market data is an authorization input, not a dashboard decoration. A stale, low-quality or materially divergent reference causes COVENANT to refuse authority.

## Current startup status

This is an early hackathon prototype. There are no claimed customers, design partners or production assets under management yet. External product review and customer discovery are the next validation steps.

## Evidence map

- `src/policy/evaluator.mjs`
- `src/evidence/pyth-pro.mjs`
- `src/evidence/tsla-pyth-jupiter.mjs`
- `anchor/programs/covenant_runtime/`
- `scripts/t3b-surfpool-execute.mjs`
- `scripts/t4-self-healing-surfpool.mjs`
- `scripts/devnet-authority-canary.mjs`
- `demo/`
