# T3 — Execution Boundary Proof

Status: **T3 PASS — T3a authority boundary proven in LiteSVM and T3b exact Apple ACQUIRE proven on a Surfpool mainnet-shaped fork**

COVENANT's T3 requirement is not satisfied by displaying an `ALLOW` result. The same governed path must make the allowed economic state change possible and make the corresponding refused transition impossible.

## Boundary selected

The first enforcement boundary is a **PDA-controlled Position Vault**.

The proposer/agent never owns generic custody authority over the vault. A transition requires:

1. the position's stored Covenant hash;
2. the current position version;
3. the exact nonce;
4. an allowed operator;
5. an amount inside the delegated cap;
6. a bound settlement destination;
7. a non-expired proof;
8. non-zero Claim Passport, evidence-root, pre-state, post-state and receipt commitments;
9. the evaluator signer configured by the owner.

After a successful transition the program increments the nonce and position version, which makes the consumed proof non-replayable.

Owner controls can freeze/unfreeze the position and rotate the evaluator. Rotation consumes a nonce so an old evaluator authorization cannot remain valid against the same state version/nonce pair.

## T3a verification result

GitHub Actions run `35692639745` completed successfully on 2026-09-22 after building the Anchor program with Solana 3.1.10 / Anchor 1.1.2 and executing the LiteSVM suite.

Four authority-boundary tests passed:

- an evaluator-approved proof moved real simulated lamports from the PDA vault and advanced nonce/version;
- reusing the consumed proof failed;
- a wrong evaluator and destination substitution could not move value;
- owner freeze invalidated a pending proof and blocked execution;
- Covenant amendment preserved the same Invariant Position identity, incremented version/nonce, invalidated the old proof, and permitted a fresh proof under the amended Covenant.

This closes **T3a**. T3b subsequently closed the complete Stocklana T3 gate in GitHub Actions run `35698743841`: an exact proof-gated USDC → AAPLx transition executed through Jupiter on a Surfpool mainnet-shaped fork, advanced nonce/version and current claim state, produced a Transition Receipt, and rejected replay with unchanged balances.

## What T3a proves

T3a will prove the **authority boundary** with a real Solana value movement in LiteSVM/localnet:

```
PROPOSER
  -> deterministic evaluator ALLOW
  -> evaluator signs exact proof
  -> COVENANT program validates state/version/nonce/operator/amount/destination/expiry
  -> PDA vault moves value
  -> nonce + position version advance
```

A substituted destination, wrong evaluator, replayed proof, stale proof, frozen position, excessive amount, changed Covenant hash, or disallowed operator must fail before value moves.

## T3b verification result

The generic `execute_proven_transition` remains the T3a authority primitive. The canonical Stocklana ACQUIRE is now implemented separately as `execute_apple_acquire`.

Run `35698743841` verified the constrained adapter with:

- input mint and amount;
- exact output claim mint;
- quote/route commitment;
- minimum output;
- proof expiry;
- Claim Passport version;
- evidence root;
- pre/post position hashes.

The successful fork transition spent exactly `100000000` raw USDC units, received `29334103` raw AAPLx units against a committed minimum of `29188074`, changed `current_claim_mint` to the exact AAPLx mint, and advanced position version/nonce from `0/0` to `1/1`.

The same consumed proof was then replayed and rejected with `PositionVersionMismatch`; balances remained unchanged.

This is the implementation form of:

> Proof before power. Authority attaches to the transition, not merely to the wallet.
