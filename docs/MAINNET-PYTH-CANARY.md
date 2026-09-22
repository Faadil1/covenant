# Stocklana — Pyth + Mainnet Canary Gate

**Status:** implementation branch; no mainnet financial execution is claimed until an Explorer-verifiable transaction exists.

## Goal

Turn the Stocklana proof into one judge-readable end-to-end statement:

> COVENANT used live Pyth market data to decide whether an exact Apple token representation remained inside the owner's rules, then allowed one tightly capped Solana mainnet transition and refused replay.

## Pyth policy

The canary uses the Stocklana-native feeds named by the Pyth bounty:

- `Equity.US.AAPL/USD`
- `Crypto.AAPLX/USD`
- `Crypto.AAPLON/USD`

For the first mainnet canary, only AAPL -> AAPLx is executable. AAPLon remains comparison evidence until a separately bounded migration is justified.

Pyth is policy-relevant, not decorative. The canary Covenant requires:

1. fresh signed Pyth evidence;
2. AAPLx tracking error versus AAPL <= 75 bps;
3. Pyth confidence <= 50 bps;
4. at least one publisher on the weakest of the compared feeds;
5. exact Jupiter route impact <= 50 bps;
6. exact approved AAPLx mint;
7. Token-2022;
8. autonomous economic value <= $20 absolute hard cap.

Any missing/stale/failed record -> `REFUSE`.

## Mainnet safety envelope

The first mainnet proof must remain deliberately boring:

- ACQUIRE only;
- USDC -> exact AAPLx mint only;
- default amount: $5;
- absolute script hard cap: $20;
- short-lived proof;
- one nonce;
- exact Jupiter CPI commitment;
- no generic wallet authority;
- replay must fail;
- no migration on the first mainnet canary;
- no website-initiated signing.

The execution script must not run inside CI. The key stays on the operator machine.

## Gates

### Gate A — PYTH LIVE PASS

Run:

```bash
PYTH_API_KEY=... npm run probe:pyth
```

Required evidence:

- all three Stocklana symbols resolve;
- signed Solana Pyth payload returned;
- payload hash persisted;
- AAPL and AAPLx prices parse correctly;
- Pyth tracking/confidence rules are evaluated by the same deterministic evaluator.

### Gate B — MAINNET PREFLIGHT PASS

Run:

```bash
PYTH_API_KEY=... \
JUPITER_API_KEY=... \
COVENANT_MAINNET_POSITION=... \
COVENANT_DESTINATION_TOKEN_ACCOUNT=... \
npm run preflight:mainnet
```

This script **never signs or submits**. It verifies:

- RPC responds;
- COVENANT program exists and is executable;
- Position exists;
- exact AAPLx destination account is configured;
- live Pyth rules ALLOW;
- Jupiter route remains inside the Covenant;
- Jupiter build contains no unexpected setup/cleanup/other/tip instructions.

Only then may it print `READY_FOR_EXPLICIT_SIGNING`.

### Gate C — MAINNET CANARY EXECUTED

This gate is intentionally not satisfied by code or CI.

It requires all of:

- explicit operator signature with the local wallet;
- actual mainnet settlement;
- Explorer-verifiable transaction signature;
- exact spend <= configured canary amount;
- exact AAPLx destination;
- resulting Position version/nonce increment;
- Transition Receipt;
- replay attempt rejected with balances unchanged.

Until that exists, public wording must remain:

> **Mainnet canary prepared / preflighted — not executed.**

After it exists:

> **A Pyth-gated COVENANT authorization moved a capped amount of real value on Solana mainnet; replay of the consumed authorization was refused.**

## Pyth verification boundary

Pyth Pro returns a signed Solana payload. This branch hashes that signed payload into policy evidence so the market data directly changes `ALLOW | REFUSE`.

The stronger final form is to include Pyth's Ed25519 + Pyth verification instructions in the same atomic Solana transaction and bind that verified message to COVENANT's exact transition authorization. Pyth's SVM design requires the Ed25519 instruction to be explicit in the submitted transaction; it cannot be hidden behind a CPI.

Do not claim that final onchain Pyth-message binding until the program and transaction path verify it end-to-end.
