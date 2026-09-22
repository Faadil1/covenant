# Treasury Semantic Portability Gate — PASS
**Date:** 2026-09-22  
**Scope:** static semantic portability, not execution and not commercial validation.

## What changed

The Apple fixtures were replaced with three real Treasury/cash-equivalent Claims:

- Superstate / Invesco USTB;
- OpenEden TBILL;
- Ondo USDY.

No change was required to:

- `src/policy/evaluator.mjs`;
- the `ALLOW | ESCALATE | REFUSE` decision model;
- the core Transition Proof schema;
- nonce/version semantics;
- authority semantics.

Only new Claim Passports and a new Covenant were added.

## Test mandate

The research Covenant models a hypothetical U.S. institutional holder who is both an Accredited Investor and Qualified Purchaser and requires:

1. authoritative provider identity;
2. compatible U.S. primary access;
3. same-day normal redemption;
4. a fund/share-like legal claim rather than exposure-only bearer-note semantics.

This is a portability test, not investment advice.

## Deterministic result

| Claim | Result | Material reason |
|---|---|---|
| USTB | ALLOW | U.S. Accredited + Qualified Purchaser access; same-day redemption; ownership in the fund represented by shares |
| TBILL | REFUSE | normal redemption is typically next 1 U.S. business day, exceeding a same-day mandate |
| USDY | REFUSE | primary mint/redeem is non-U.S.-only; USDY is exposure to Treasuries rather than a right to receive the underlying Treasuries |

## Why this matters

This is the first direct evidence that COVENANT's core is not Apple-specific.

The same evaluator can reason over:

- equity representations;
- private fund shares;
- tokenized professional-fund interests;
- bearer-note economic exposure;

as long as each policy-relevant fact is expressed as an evidence-bearing Claim Passport field.

## Truth boundary

This gate does **not** prove:

- a Treasury migration route;
- onchain execution between these Claims;
- tax/legal equivalence;
- suitability for any investor;
- customer demand;
- willingness to pay.

It proves only that the semantic/evaluation/proof architecture ports without core changes.

The next gates remain:

1. Treasury lifecycle / representation-mobility execution or a truthful non-executing ESCALATE path;
2. a real operator confirms that this resembles a workflow they manage;
3. design-partner / paid-pilot evidence.

## Authoritative sources

### USTB
- https://superstate.com/assets/ustb

### TBILL
- https://docs.openeden.com/tbill/product-structuring.md
- https://docs.openeden.com/tbill/investor-onboarding.md
- https://docs.openeden.com/tbill/redemptions.md

### USDY
- https://ondo.finance/usdy
- https://ondo.finance/
