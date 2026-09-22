# T3b — exact Apple ACQUIRE evidence

This directory stores time-bound evidence for the Stocklana Apple ACQUIRE boundary.

## 1. Mainnet-shaped Surfpool preflight

Start a Surfnet mainnet fork and deploy the current COVENANT program. Surfpool supports `--network mainnet` and lazy mainnet account loading; run it from the Anchor workspace so the compiled program can be deployed.

Then create the stable Invariant Position PDA, fund its Position-owned USDC token account in the fork, and create its Position-owned AAPLx Token-2022 account.

Run:

```bash
SURFPOOL_RPC_URL=http://127.0.0.1:8899 \
COVENANT_TAKER=<POSITION_PDA> \
COVENANT_DESTINATION_TOKEN_ACCOUNT=<POSITION_AAPLX_ACCOUNT> \
npm run preflight:t3b:surfpool
```

The preflight fails closed unless it can prove:

- the COVENANT program is deployed and executable;
- the real Jupiter V6 program is executable in the mainnet-shaped fork;
- canonical USDC is a classic SPL mint;
- AAPLx is a Token-2022 mint;
- the Position PDA is owned by the COVENANT program;
- the Position owns a sufficiently funded USDC token account;
- the Position owns the exact AAPLx output account.

The preflight performs **no state mutation**.

## 2. Jupiter V2 build commitment

With the same Position PDA as the taker and Position-owned AAPLx account as destination:

```bash
COVENANT_TAKER=<POSITION_PDA> \
COVENANT_DESTINATION_TOKEN_ACCOUNT=<POSITION_AAPLX_ACCOUNT> \
npm run probe:t3b
```

The probe calls Jupiter Swap API V2 `/build` and does not sign or submit anything. It validates exact mint, amount, slippage and Jupiter-program constraints, commits the ordered account metas and instruction bytes, and writes a time-bound evidence packet.

A Jupiter build response is routing material, not authority. T2 must return `ALLOW`, and the COVENANT program must match the exact execution commitment before CPI.

## Truth boundary

Neither evidence probe authorizes a trade. The T3 gate closes only when the exact `ALLOW -> proof -> governed CPI -> balance deltas -> receipt` sequence executes on the fork while the corresponding REFUSE path cannot move funds.

Never commit API keys or wallet/private-key material.
