# Representation Repair Runtime v1

Status: **IMPLEMENTED PLANNER — NON-EXECUTING**

Self-healing in COVENANT means the **Invariant Position survives when one token representation stops satisfying its Covenant**. It does not mean that an autonomous agent receives open-ended permission to trade.

The canonical repair loop is:

```
CURRENT REPRESENTATION
  -> re-evaluate evidence
  -> still ALLOW? -> STAY
  -> REFUSE?
       -> qualifying alternate exists?
            -> no  -> FREEZE or ESCALATE
            -> yes -> MIGRATE proposal
                     -> fresh evidence
                     -> fresh Transition Proof
                     -> normal authority boundary
                     -> atomic settlement
                     -> receipt
```

## Planner contract

`src/runtime/repair-planner.mjs` produces one of four non-executing outcomes:

- `STAY` — current representation remains in Covenant;
- `MIGRATE` — one alternate representation qualifies and migration authority is delegated;
- `FREEZE` — the Position should stop autonomous economic changes;
- `ESCALATE` — owner/higher authority is required.

A `MIGRATE` plan always sets:

- `requiresFreshEvidence = true`;
- `requiresFreshTransitionProof = true`;
- `executable = false`.

It must re-enter the normal COVENANT runtime. The planner itself cannot move funds.

## Human-agency rule

If multiple alternate claims qualify and the owner/Covenant has not defined an explicit representation priority, COVENANT **ESCALATES** instead of silently choosing.

This prevents a hidden optimization heuristic from becoming de facto investment authority.

If the owner provides a versioned priority list, the planner may deterministically select the first qualifying alternate from that list.

## Stocklana story

The verified Stocklana run proves ACQUIRE, not MIGRATE.

The demo's “Representation repair preview” is therefore intentionally synthetic and labeled as such. It visualizes the next runtime behavior without falsely claiming that a live AAPLx → AAPLon migration has already been executed.

The next technical extension can reuse the T3b authority primitive for an exact `MIGRATE` operator once both source reduction and target acquisition postconditions are bound into one proof.
