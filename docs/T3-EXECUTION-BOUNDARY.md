# T3 — Execution Boundary Proof

Status: **T3a PASS — authority boundary proven in LiteSVM; T3b Apple ACQUIRE remains open**

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

This closes **T3a**, not the complete Stocklana T3 gate. The remaining bar is T3b: exact governed USDC → Apple-claim settlement on a mainnet-shaped fork/devnet path.

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

## What T3a does not claim

The current `execute_proven_transition` settlement is **not yet the canonical Apple ACQUIRE**. It is the load-bearing authority primitive beneath it.

T3 is only fully closed for the Stocklana demo after this boundary constrains the exact swap/settlement path (target: USDC -> exact Apple claim) and the post-settlement state is verified.

No UI work should treat T3 as complete until that final route-binding test exists.

## T3b target

Replace the generic settlement transfer with a constrained execution adapter that binds:

- input mint and amount;
- exact output claim mint;
- quote/route commitment;
- minimum output;
- proof expiry;
- Claim Passport version;
- evidence root;
- pre/post position hashes.

The program then verifies settlement and persists the new position version/receipt reference.

This is the implementation form of:

> Proof before power. Authority attaches to the transition, not merely to the wallet.
