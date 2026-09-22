# COVENANT Runtime Architecture v1

Status: **IMPLEMENTATION BASELINE AFTER T1–T3 PASS**

COVENANT is a runtime for proof-carrying economic state transitions. The production architecture therefore preserves one explicit trust sequence:

```
ECONOMIC INTENT
  -> COVENANT / INVARIANTS
  -> CLAIM PASSPORT + LIVE EVIDENCE
  -> PROPOSED POST-STATE
  -> DETERMINISTIC EVALUATION
  -> EXACT EXECUTION COMMITMENT
  -> TRANSITION PROOF
  -> ONCHAIN AUTHORITY BOUNDARY
  -> ECONOMIC STATE CHANGE
  -> RECEIPT
  -> CONTINUOUS RE-EVALUATION
```

## 1. Core objects

### Invariant Position

Stable owner-level identity for one economic intention.

It survives representation changes. A migration from AAPLx to another qualifying Apple claim changes the implementation, not the Position identity.

Onchain minimum state:

- owner;
- evaluator;
- Covenant hash;
- position version;
- nonce;
- autonomous authority cap;
- allowed operator mask;
- frozen state;
- current claim mint;
- last receipt commitment.

### Covenant

Versioned deterministic rules. The runtime evaluates rule paths against typed evidence records.

A rule must define:

- exact evidence path;
- operator and expected value;
- minimum evidence class where required;
- freshness bound where required;
- hard/soft behavior;
- UNKNOWN behavior;
- explicit failure reason code.

### Claim Passport

Versioned evidence object for one exact representation.

A Passport is not a marketing profile. Policy-relevant fields carry evidence class, source, observation time and verification state.

### Transition Proposal

One exact requested economic change:

- Position;
- operator;
- amount;
- target claim;
- proposed post-state;
- authority context.

### Execution Commitment

The executable boundary between policy and settlement.

For Stocklana ACQUIRE it binds the exact Jupiter CPI invocation plus input/output mint, amount and minimum output. An ALLOW decision without this commitment is deliberately **not executable**.

### Transition Proof

Hash-bound packet over:

- Covenant;
- Claim Passport;
- evidence root;
- pre-state;
- proposed post-state;
- authority;
- exact execution commitment;
- nonce;
- expiry;
- deterministic rule results.

### Transition Receipt

Post-settlement evidence binding the proof to the actual settled state and transaction reference.

## 2. Runtime stages

```
PROPOSED
  |
  +-- REFUSE ------> no proof, no authority
  |
  +-- ESCALATE ----> owner/higher authority required
  |
  +-- ALLOW
         |
         | exact execution material available?
         |
         +-- no --> ALLOW but non-executable
         |
         +-- yes
                -> PROVEN
                -> evaluator authorizes
                -> onchain program verifies
                -> execute
                -> receipt
```

This distinction is deliberate: **ALLOW is a policy result, not transaction authority.**

## 3. Trust boundaries

### Deterministic offchain evaluator

Responsible for:

- issuer/legal evidence adapters;
- live market evidence;
- portfolio postconditions;
- Covenant rule evaluation;
- building the exact proof packet.

AI may help construct intent or explain a result, but AI output is outside this trust boundary.

### Solana program

Responsible for:

- current Position identity/state;
- owner-selected evaluator;
- Covenant hash;
- version + nonce;
- expiry;
- delegated operator/value cap;
- exact token-account ownership/mints;
- exact execution commitment;
- Jupiter allowlist;
- settlement balance deltas;
- atomic state advance;
- replay prevention.

The program does not silently reinterpret issuer semantics.

## 4. Canonical code paths

- `src/policy/evaluator.mjs` — deterministic rule evaluation.
- `src/proof/transition-proof.mjs` — evidence root, proof and receipt hashing.
- `src/runtime/covenant-runtime.mjs` — canonical PROPOSE -> PROVE orchestration.
- `src/execution/jupiter-v2.mjs` — exact Jupiter build/invocation commitment.
- `anchor/programs/covenant_runtime` — onchain authority and settlement boundary.
- `scripts/t3b-surfpool-execute.mjs` — reproducible Stocklana fork proof harness.

## 5. Non-negotiable invariants

1. UNKNOWN never silently becomes TRUE.
2. REFUSE cannot produce an executable Transition Proof.
3. ALLOW alone is non-executable.
4. Execution authority binds to one exact state transition.
5. Proof expiry, version and nonce prevent stale/replayed authority.
6. Output claim mint must equal the proof-bound claim.
7. Settlement must satisfy postconditions atomically.
8. State advances only after successful settlement.
9. Mainnet execution stays separately guarded.
10. Representation changes preserve Invariant Position identity.

## 6. Next implementation layer

With T1–T3 closed, the next product layer should consume this runtime rather than reimplement it:

```
OWNER INTENT UI
  -> Covenant compiler
  -> Claim Graph resolver
  -> evidence adapters
  -> runtime propose/prove API
  -> governed Solana executor
  -> receipt + Position state
  -> continuous re-evaluation / repair proposal
```

The first UX should expose the economic intention, invariant status, proposed transition and proof/receipt story. It should not collapse the product back into a ticker terminal, router or generic wallet.
