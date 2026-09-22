# Stocklana fallback — Tesla live reference

**Status:** live Pyth + live Jupiter + real COVENANT evaluator validated. Mainnet financial execution is not yet claimed.

## Why this fallback exists

The preferred Stocklana demo remains Apple because it demonstrates representation mobility across AAPLx and AAPLon.

The current Pyth trial key is not entitled to the three Apple feeds required by that demo. Rather than weaken the Pyth integration or fake market data, COVENANT uses a second, truthful canary that is available under the current trial:

`Equity.US.TSLA/USD` → Pyth feed ID `1435`

The approved Solana representation is the official xStocks Tesla token:

`TSLAx` → `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB`

The xStocks issuer API and Solana mainnet RPC both independently verified this mapping. The mint is Token-2022 with 8 decimals.

## Economic rule

Pyth supplies the live economic reference. Jupiter supplies the live executable representation price.

```
Pyth TSLA/USD
      ↓
Tesla reference price
      +
Jupiter $5 USDC → TSLAx quote
      ↓
implied executable TSLAx price
      ↓
COVENANT
      ↓
tracking error + confidence + publishers + route impact
      ↓
ALLOW / REFUSE
```

The current canary rules are:

- Pyth evidence age <= 20 seconds;
- executable TSLAx price must be within 75 bps of Pyth TSLA;
- Pyth confidence <= 50 bps;
- at least 1 publisher;
- Jupiter route impact <= 50 bps;
- exact official TSLAx mint;
- Token-2022;
- autonomous value capped at $20, with a $5 default canary.

## Live validation

GitHub Actions run: `35794106102`

Artifact: `10723506130`

Observed live values in that run:

- Pyth TSLA: $378.63462;
- Pyth confidence: 2.23 bps;
- publisher count: 11;
- market session: post-market;
- Jupiter route: BinaryFi;
- $5 quote output: 0.01320514 TSLAx;
- implied executable TSLAx price: $378.64044;
- tracking error: 0.154 bps;
- all candidate gates passed.

A later full COVENANT run also returned `ALLOW`; tracking error naturally changed with the live market but remained well inside the 75 bps ceiling.

## Canonical files

- `fixtures/passports/tesla-tslax.json`
- `fixtures/tesla-mainnet-canary-covenant.json`
- `src/evidence/tsla-pyth-jupiter.mjs`
- `scripts/tsla-claim-verify.mjs`
- `scripts/tsla-fallback-live-check.mjs`
- `scripts/tsla-mainnet-preflight.mjs`
- `test/tsla-fallback-policy.test.mjs`

Run locally:

```bash
npm run probe:tsla-fallback
npm run preflight:tsla-mainnet
```

## Current mainnet boundary

The TSLA preflight currently returns `NOT_READY` because the configured COVENANT program ID is not deployed on Solana mainnet.

This is now the primary blocker for a real TSLAx canary. Pyth TSLA entitlement and Jupiter routing are both working.

Do not describe this as a mainnet execution until an Explorer-verifiable transaction exists.

## Submission routing

Plan A if Pyth grants Apple access before submission:

`AAPL / AAPLx / AAPLon → representation mobility killer demo`

Plan B if Apple feed access remains unavailable:

`Pyth TSLA → Jupiter TSLAx → COVENANT ALLOW/REFUSE → tiny mainnet canary`

Apple T1–T4 remains the deeper representation-mobility proof in both cases.
