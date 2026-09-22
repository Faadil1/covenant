# T4/T5 Runtime Proofs

Status: **T4 RUNTIME INVALIDATION PASS / T5 RECEIPT INTEGRITY PASS**

These gates extend the Stocklana T1–T3 wedge without weakening its truth boundary.

## T4 — dynamic invalidation

`src/runtime/revalidation.mjs` re-evaluates the same exact claim against a new evidence state.

The invariant is:

```
claim A @ evidence N   -> ALLOW -> IN_COVENANT
same claim A @ N + 1   -> REFUSE -> OUT_OF_COVENANT
```

When the Position leaves Covenant, the runtime can invoke the non-executing repair planner:

```
OUT_OF_COVENANT
  -> qualifying alternate?
  -> MIGRATE proposal / FREEZE / ESCALATE
  -> fresh evidence
  -> fresh Transition Proof
  -> normal governed execution
```

The runtime explicitly reports `oldProofReusable: false`.

### Important boundary

This T4 runtime proof does **not** claim that the onchain program can revoke an already-signed, still-unexpired proof at the exact instant offchain evidence changes.

Currently, outstanding proof exposure is bounded by:

- proof expiry;
- nonce/version consumption;
- owner freeze/amendment;
- evaluator rotation.

A future production hardening path can add an onchain evidence epoch/revocation primitive if sub-expiry instantaneous invalidation is required.

## T5 — receipt integrity

`src/runtime/receipt-verifier.mjs` deterministically checks that a receipt binds to:

- the exact proof hash;
- Position identity;
- Covenant hash;
- Claim Passport hash;
- evidence root;
- execution commitment;
- observed settled-state hash;
- expected transaction reference fields when supplied;
- `EXECUTED` outcome;
- the receipt's own canonical hash.

Tampering with settled state invalidates verification.

## Why this matters

T1–T3 prove that COVENANT can make one exact economic transition real.

T4/T5 prove two additional runtime properties:

1. **economic truth can change after acquisition without destroying the Position identity**;
2. **a completed transition remains independently checkable as evidence rather than becoming an opaque agent action**.
