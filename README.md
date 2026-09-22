# COVENANT

**Let software change how your stock is represented — without letting it change what you agreed to own.**

A tokenized stock can have multiple Solana representations with different issuers, rights, liquidity and market behavior. COVENANT lets an owner define the economic rules that must remain true. An agent receives authority for **one exact transition only** when the proposed post-state still satisfies those rules.

```
OWNER INTENT
   ↓
COVENANT
   ↓
live evidence + exact Claim
   ↓
ALLOW / ESCALATE / REFUSE
   ↓
exact one-time authorization
   ↓
Solana execution
```

## Stocklana demo

The Stocklana wedge is Apple exposure:

- **AAPLx** — xStocks / Backed, exact Solana Token-2022 mint.
- **AAPLon** — Ondo Stocks, exact Solana Token-2022 mint.
- **Pyth Pro** — live AAPL / AAPLx / AAPLon market evidence.
- **Jupiter** — exact route construction and CPI settlement.
- **COVENANT Position PDA** — owns transition authority, nonce/version state and replay protection.

The simple user promise:

> **Keep Apple exposure inside my rules. If a representation no longer qualifies, software may not move value unless a fresh exact authorization exists.**

## What is already proven

**T1–T4 technical proof: PASS.**

- Real AAPLx and AAPLon Claim identities are resolved from issuer/onchain evidence.
- The same deterministic evaluator returns `ALLOW | ESCALATE | REFUSE` and fails closed on missing/stale evidence.
- A governed `USDC -> AAPLx` transition executed through Jupiter on a Surfpool mainnet-shaped fork.
- Replay of the consumed transition was refused with balances unchanged.
- A separate self-healing proof changed representation while preserving the same Position identity.
- Treasury semantic portability (USTB / TBILL / USDY) reuses the same evaluator/proof core, showing that Apple is a wedge rather than a hard-coded product identity.

Canonical fork evidence:

- T3b ACQUIRE — GitHub Actions run `35698743841`.
- T4 self-healing — run `35733746142`, artifact `10696822718`.
- Treasury portability — run `35759121490`.

## Pyth becomes policy, not decoration

The Stocklana canary Covenant consumes the exact Pyth feeds highlighted by the hackathon:

- `Equity.US.AAPL/USD`
- `Crypto.AAPLX/USD`
- `Crypto.AAPLON/USD`

For the first canary, AAPLx must remain within a bounded tracking error of AAPL, Pyth confidence must remain bounded, evidence must be fresh, and the Jupiter route must remain below the owner's execution-impact ceiling.

```
AAPL reference (Pyth)
        +
AAPLx price (Pyth)
        ↓
tracking error / confidence / freshness
        +
exact Jupiter route impact
        ↓
COVENANT
        ↓
ALLOW or REFUSE
```

Run the deterministic Pyth policy tests:

```bash
npm run test:t2
```

With a Pyth Pro key, capture live signed evidence:

```bash
PYTH_API_KEY=... npm run probe:pyth
```

## Mainnet canary

The repository now includes a **fail-closed mainnet preflight** for a tiny `USDC -> AAPLx` canary.

Default: **$5**. Absolute script hard cap: **$20**.

```bash
PYTH_API_KEY=... \
JUPITER_API_KEY=... \
COVENANT_MAINNET_POSITION=... \
COVENANT_DESTINATION_TOKEN_ACCOUNT=... \
npm run preflight:mainnet
```

The preflight does **not** load a wallet secret, sign, deploy or submit a transaction. It checks the live Pyth policy, exact Jupiter route, program deployment, Position existence and unexpected instruction material.

**Truth boundary:** a real mainnet financial transaction is **not claimed yet**. The public wording changes only after an Explorer-verifiable canary exists and replay has been tested.

See `docs/MAINNET-PYTH-CANARY.md`.

## Why Solana is load-bearing

Without Solana, COVENANT becomes an offchain policy dashboard. The technical proof uses:

- exact SPL / Token-2022 mint identity;
- PDA-controlled Position authority;
- nonce/version state;
- exact proof-bound execution commitments;
- Jupiter CPI routing;
- settlement postconditions;
- replay refusal;
- auditable receipts.

## Product boundary

COVENANT is not a generic agent wallet or router.

A wallet policy asks:

> **May this actor sign?**

COVENANT asks:

> **Would this exact state transition still leave the owner holding what they intended to own — and may authority exist for this transition only?**

**Economic intent is the interface.**
