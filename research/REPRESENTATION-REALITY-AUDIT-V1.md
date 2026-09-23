# Representation Reality Audit v1

Observed: 2026-09-23

This audit separates **verified representation facts**, **user-specific eligibility**, and **open questions**. It exists to prevent the Apple demo from turning a missing-data condition into a claim that one issuer is objectively unsafe.

## Product conclusion

COVENANT's durable problem survives the Apple example:

> preserve the owner's economic intent while representation identity, rights, eligibility, market conditions and execution routes change.

Apple remains a reference case, not the product boundary.

## Verified Apple representation facts

### AAPLx — xStocks / Backed Assets (JE) Limited

Bound in the existing Claim Passport:

- exact Solana mint verified through the official xStocks API + Solana RPC;
- Token-2022 identity verified;
- issuer mapping verified.

Additional issuer facts verified from current official xStocks documentation:

- xStocks are tracker certificates providing economic exposure, not direct Apple shares;
- they do not confer shareholder voting rights;
- they are fully collateralized 1:1 with segregated custody;
- direct issuer issuance/redemption requires KYC/AML;
- direct issuer transaction minimum is currently $5,000;
- the official xStocks site states the products are not available to residents of the United States, United Kingdom, Canada, Australia, or sanctioned jurisdictions;
- secondary-market transferability does not itself establish that a specific user is legally eligible to acquire or use the instrument.

Primary sources:

- https://docs.xstocks.fi/docs/product-legal-overview
- https://docs.xstocks.fi/docs/frequently-asked-questions
- https://docs.xstocks.fi/docs/how-xstocks-work
- https://xstocks.fi/

### AAPLon — Ondo Stocks

Bound in the existing Claim Passport:

- exact Solana mint verified from Ondo's public Solana mapping + Solana RPC;
- Token-2022 identity verified;
- issuer mapping verified.

Additional official Ondo facts:

- AAPLon provides economic exposure to AAPL; the token is not itself Apple stock and does not give the holder a right to receive the underlying AAPL shares;
- Ondo states that backing securities are not lent without express consent of the tokenholder whose tokens are backed by them;
- Ondo uses independent Verification and Security Agents as part of its investor-protection structure;
- Ondo has added a Broadridge mechanism through which holders of Ondo tokenized stocks can submit voting preferences for underlying shares; this is not the same as direct shareholder voting rights;
- eligibility remains jurisdiction- and product-specific. Generic "outside the U.S." language must not be interpreted as universal eligibility.

Primary sources:

- https://ondo.finance/ondo-stocks
- https://ondo.finance/blog/global-markets-is-live
- https://ondo.finance/blog/ondo-partners-with-broadridge-for-tokenized-stocks-voting-capabilities
- https://app.ondo.finance/assets/aaplon

## What the current repair demo actually proves

The current protection rule is:

> "Do not use a representation unless authoritative evidence says the backing securities cannot be lent without my express consent."

For AAPLon, Ondo publishes that protection explicitly.

For AAPLx, the repository currently has **no authoritative evidence bound to that exact property**.

Therefore:

- AAPLon: property VERIFIED true;
- AAPLx: property UNKNOWN;
- COVENANT: UNKNOWN fails closed.

This proves **fail-closed evidence-bound selection**.

It does **not** prove that AAPLx lends backing securities without consent.

Public copy must preserve that distinction.

## Eligibility is now a first-class input

Eligibility is not a static property of a token. It depends on at least:

- user jurisdiction;
- investor classification where relevant;
- issuer/distributor;
- venue;
- operation (acquire / hold / transfer / redeem);
- current terms and evidence time.

The evaluator therefore accepts an `eligibility` evidence object separately from the Claim Passport.

Canonical behavior:

```
INELIGIBLE -> REFUSE
UNKNOWN    -> REFUSE
ELIGIBLE   -> continue evaluation
```

Current Canada/Quebec evidence fixtures intentionally demonstrate this:

- AAPLx acquisition: VERIFIED false from the official xStocks site;
- AAPLon acquisition: UNKNOWN until exact Canada/Quebec evidence is bound.

The product must not infer AAPLon eligibility merely because Ondo markets globally outside the U.S.

## Stronger future killer-demo candidates

The next demo should prefer an **objective, user-relevant difference** rather than only an UNKNOWN-vs-VERIFIED property.

Candidates to verify with exact primary evidence:

1. acquisition / redemption eligibility for a concrete user profile;
2. direct issuer redemption minimum and availability;
3. governance / voting-preference capability;
4. issuer-protection structure;
5. live route quality or reference-vs-execution divergence;
6. corporate-action handling;
7. transfer / collateral restrictions.

A candidate becomes demo-canonical only when both sides of the comparison are bound to exact primary evidence.

## Reality Gate

Do not encode or market any of the following until exact evidence exists:

- "AAPLx is unsafe";
- "AAPLon is available to Canadians";
- "AAPLon gives Apple shareholder voting rights";
- "xStocks have no redemption rights";
- "one representation is universally better."

COVENANT evaluates **fit to an owner's explicit rules**, not a universal ranking of issuers.
