# COVENANT

**Keep the economic exposure you asked for, even when its token representation changes.**

Tokenized assets can represent the same underlying through different issuers, mints, rights and market conditions. COVENANT checks the exact representation and the exact proposed transition before software receives one-time authority to act.

```
owner intent
   ↓
exact representation + fresh evidence
   ↓
ALLOW / ESCALATE / REFUSE
   ↓
evidence-bound one-time authorization
   ↓
Solana execution
```

## What the Stocklana demo shows

**Apple = representation continuity.** AAPLx and AAPLon are distinct Solana Token-2022 representations of Apple exposure. COVENANT resolves their exact identities, evaluates policy fit, constrains execution and rejects replay.

**Tesla = live market gate.** The current Pyth trial does not grant the required Apple feeds, so the live fallback uses Pyth `Equity.US.TSLA/USD` feed `1435` and an executable Jupiter `USDC -> TSLAx` quote. The real evaluator checks freshness, Pyth confidence, publisher count, execution tracking error and route impact before returning ALLOW or REFUSE.

Live TSLA fallback run: `35794379825`.

## Verified technical evidence

| Boundary | Status | Evidence |
| --- | --- | --- |
| Exact AAPLx / AAPLon identity | PASS | issuer + Solana RPC |
| Deterministic ALLOW / ESCALATE / REFUSE | PASS | tests |
| Governed USDC -> AAPLx execution | PASS | Surfpool run `35698743841` |
| Replay rejection | PASS | same T3 run |
| AAPLx -> AAPLon representation migration | PASS | run `35733746142`, artifact `10696822718` |
| Live Pyth TSLA + Jupiter TSLAx policy gate | PASS | run `35794379825` |
| Full COVENANT mainnet deployment | NOT CLAIMED | preflight only |
| Devnet authority canary | automated workflow | `covenant-devnet-authority-canary` |

## Cryptographic scope

COVENANT does **not** claim a zero-knowledge proof or a formal proof system.

The internal Rust type `TransitionProofArgs` is an **authorization/evidence packet**. SHA-256 commitments bind the Covenant, representation record, evidence root, pre/post state, receipt material and exact execution commitment. The evaluator must sign the transaction, while the Solana program independently checks the stored Covenant hash, evaluator identity, Position version, nonce, expiry, operator, value cap and exact execution material before the PDA can move value.

Public wording therefore uses **evidence-bound authorization** rather than implying ZK or formal verification.

## Why Solana matters

The onchain boundary uses:

- a PDA-controlled Position;
- exact SPL / Token-2022 identities;
- evaluator signer checks;
- version + nonce replay protection;
- expiry and autonomous value caps;
- exact execution commitments;
- Jupiter CPI constraints for the Stocklana path;
- post-settlement checks and receipts.

Without the onchain boundary, this would only be an offchain rules engine.

## Product boundary

A wallet policy asks:

> May this actor sign?

A router asks:

> Where can I trade?

COVENANT asks:

> Does this exact transition still preserve the economic exposure I asked for, and may software receive authority for this transition only?

## Run the evidence

```bash
npm run test:t2
npm run probe:tsla-fallback
npm run preflight:tsla-mainnet
```

The public browser demo is intentionally a sandbox. Verified fork execution and live-market evidence are linked from the Evidence page. The devnet canary workflow deploys and exercises the authority boundary on public Solana devnet without using mainnet funds.

## Repository map

- `src/policy/evaluator.mjs` — deterministic policy engine
- `src/evidence/` — Pyth and market-evidence adapters
- `src/execution/` — exact execution commitments
- `anchor/programs/covenant_runtime/` — Solana authority boundary
- `fixtures/passports/` — exact representation records
- `scripts/` — reproducible evidence harnesses
- `demo/` — judge-facing product surface
- `docs/SUBMISSION-PACK.md` — concise submission narrative

**Truth boundary:** no full COVENANT mainnet financial execution is claimed until an Explorer-verifiable mainnet transaction exists.
