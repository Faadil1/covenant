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


## 3. Governed fork execution

`npm run prove:t3b:surfpool` is the canonical end-to-end technical proof. It:

1. boots an embedded Surfpool mainnet-shaped fork;
2. deploys the current COVENANT program at its canonical program id;
3. creates the Invariant Position through the normal program instruction;
4. uses Surfpool cheatcodes only to seed fork-only USDC/AAPLx test balances before authorization;
5. collects live Jupiter execution evidence and evaluates the executable Apple Covenant;
6. creates an executable Transition Proof only when the deterministic evaluator returns `ALLOW`;
7. binds the exact Jupiter CPI accounts/data, input amount, output mint and min-out into the proof;
8. executes USDC -> AAPLx through the Position PDA;
9. verifies economic balance deltas, claim state, nonce/version and receipt commitment;
10. replays the consumed proof and requires rejection with no balance movement.

The companion REFUSE case never receives executable proof. If AAPLon no longer violates the live market rule when the proof runs, the harness falls back to a deliberately stale AAPLx evidence record so fail-closed behavior remains deterministic and explicitly labeled.

A PASS here is **L2 signed preflight + constrained onchain execution on a mainnet-shaped fork**. It is not a mainnet financial trade.
