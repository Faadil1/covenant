# T1 — Claim Graph Reality Proof

This directory documents the **live evidence probe** for the Stocklana proof wedge.

The probe deliberately fails closed. It does not authorize a claim from a symbol alone.

## Pass conditions

T1 is a machine-level PASS only when:

1. the official xStocks API resolves AAPLx to an exact Solana deployment;
2. an official Ondo repository resolves AAPLon to an exact Solana mint;
3. both exact mint accounts exist through Solana RPC;
4. the two mint addresses are distinct.

Live Jupiter quote availability is captured separately because route availability can legitimately change over time. Missing route evidence stays `UNKNOWN`; it is never converted to PASS.

## Evidence classes

- `ONCHAIN_DETERMINISTIC`: Solana RPC state.
- `SIGNED_OR_AUTHORITATIVE_OFFCHAIN`: official issuer/project API or repository.
- `LIVE_MARKET_OR_ORACLE`: Pyth/Hermes or executable Jupiter quote.
- `UNKNOWN`: unavailable/failed evidence.

## Run

```bash
npm run probe:t1
```

Optional environment variables:

```bash
SOLANA_RPC_URL=...
PYTH_HERMES_URL=...
JUPITER_QUOTE_URL=...
```

Runtime JSON is intentionally git-ignored. CI uploads it as a build artifact so a time-specific observation is not confused with permanent source code.
