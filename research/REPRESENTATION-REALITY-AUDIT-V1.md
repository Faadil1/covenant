# Representation Reality Audit v1

Observed: 2026-09-23

This audit separates **representation facts**, **user-specific eligibility**, **market/execution evidence**, and **open questions**. Its purpose is to keep the Apple demo factual: COVENANT evaluates fit to an owner's explicit rule, not a universal ranking of issuers.

## Product conclusion

COVENANT's durable problem survives the Apple example:

> preserve the owner's economic intent while representation identity, rights, eligibility, mint controls, market conditions and execution routes change.

Apple is the reference case, not the product boundary.

## Canonical objective Apple difference

A reproducible mainnet Token-2022 inspection now gives the killer demo an objective two-sided fact.

Workflow:

- run: `35884969091`
- artifact: `10761673239`
- observedAt: `2026-09-23T15:54:35.225Z`
- source class: `ONCHAIN_DETERMINISTIC`

### AAPLx

Exact mint:

`XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp`

Observed Token-2022 extensions include:

- MetadataPointer
- **PermanentDelegate**
- DefaultAccountState
- ScaledUiAmountConfig
- PausableConfig
- ConfidentialTransferMint
- TransferHook
- TokenMetadata

Active permanent delegate:

`5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq`

Result:

`permanentDelegateActive = true`

### AAPLon

Exact mint:

`123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo`

Observed Token-2022 extensions include:

- ScaledUiAmountConfig
- MetadataPointer
- PausableConfig
- DefaultAccountState
- ConfidentialTransferMint
- TransferHook
- TokenMetadata

No PermanentDelegate extension was observed.

Result:

`permanentDelegateActive = false`

### Why this property matters

Solana's official Token-2022 documentation defines `PermanentDelegate` as a mint-level authority that can authorize transfers and burns for any token account for that mint. Token-account owners cannot revoke the permanent delegate from their token accounts.

Primary semantic source:

- https://solana.com/docs/tokens/extensions/permanent-delegate

This gives COVENANT a concrete owner-selectable rule:

> **Do not use a representation with an active permanent token-moving delegate.**

Under that rule:

```
AAPLx   -> active PermanentDelegate -> REFUSE
AAPLon  -> no PermanentDelegate     -> continue evaluation
```

This is an exact mint-control comparison. It is no longer an UNKNOWN-vs-VERIFIED story.

## Critical truth boundary

The objective difference does **not** establish:

- that AAPLx is universally unsafe;
- that AAPLon is universally safer;
- that AAPLon has no issuer controls;
- that absence of PermanentDelegate means the holder has unrestricted control;
- that every investor should prefer AAPLon.

Both exact mints expose other Token-2022 controls, including PausableConfig and TransferHook.

COVENANT's claim is narrower:

> These exact Apple representations differ on an onchain authority property, and an owner may choose a policy that rejects that property.

## Verified representation identity

### AAPLx — xStocks / Backed Assets (JE) Limited

Bound in the Claim Passport:

- exact Solana mint verified through the official xStocks API + Solana RPC;
- Token-2022 identity verified;
- issuer mapping verified;
- active PermanentDelegate verified from exact mainnet mint state.

Additional official xStocks documentation describes xStocks as tracker certificates providing economic exposure rather than direct registered Apple shares. Availability, direct issuance/redemption, KYC and other legal/economic properties remain issuer- and jurisdiction-specific.

Primary sources:

- https://docs.xstocks.fi/docs/product-legal-overview
- https://docs.xstocks.fi/docs/frequently-asked-questions
- https://docs.xstocks.fi/docs/how-xstocks-work
- https://xstocks.fi/

### AAPLon — Ondo Stocks

Bound in the Claim Passport:

- exact Solana mint verified from Ondo's public Solana mapping + Solana RPC;
- Token-2022 identity verified;
- issuer mapping verified;
- absence of PermanentDelegate verified from exact mainnet mint state.

Ondo also documents its own product/legal structure and investor-protection mechanisms. Those are separate from the Token-2022 mint-control comparison.

Primary sources:

- https://ondo.finance/ondo-stocks
- https://ondo.finance/blog/global-markets-is-live
- https://ondo.finance/blog/ondo-partners-with-broadridge-for-tokenized-stocks-voting-capabilities
- https://app.ondo.finance/assets/aaplon

## Historical lending-consent research

The earlier repair demo used a holder-consent-before-collateral-lending rule:

- AAPLon had authoritative evidence bound to TRUE;
- AAPLx remained UNKNOWN for that exact property.

That remained a valid demonstration of **UNKNOWN fails closed**, but it was weaker as a killer demo because a skeptic could correctly say the source representation was rejected because evidence was missing.

That comparison is now secondary historical evidence, not the canonical judge story.

## Eligibility is a separate first-class gate

Representation identity and eligibility are different questions.

Eligibility can depend on:

- user jurisdiction;
- investor classification;
- issuer/distributor;
- venue;
- operation such as acquire / hold / transfer / redeem;
- current terms and evidence time.

The evaluator accepts an `eligibility` evidence object separately from the Claim Passport.

Canonical behavior:

```
INELIGIBLE -> REFUSE
UNKNOWN    -> REFUSE
ELIGIBLE   -> continue evaluation
```

Current Canada/Quebec evidence fixtures intentionally demonstrate:

- AAPLx acquisition: VERIFIED false under the bound current xStocks jurisdiction evidence;
- AAPLon acquisition: UNKNOWN until exact Canada/Quebec evidence is bound.

The product must never infer AAPLon eligibility from generic global or "outside the U.S." language.

## Market and execution remain separate gates

Passing the PermanentDelegate rule does not authorize a migration by itself.

A target must still pass all relevant current conditions, including:

- issuer/identity checks;
- user eligibility where required;
- live route constraints;
- exact amount and target;
- authority cap;
- nonce/version/expiry;
- execution commitment.

The objective representation difference answers **which representation can satisfy the owner's mint-control rule**. The execution proof answers **whether this exact transition is authorized now**.

## Reality Gate

Do not encode or market any of the following as universal conclusions:

- "AAPLx is unsafe";
- "AAPLon is safe";
- "AAPLon is available to Canadians";
- "AAPLon has no issuer control";
- "PermanentDelegate is malicious";
- "one Apple representation is universally better."

COVENANT evaluates **fit to an explicit owner rule under current evidence**.
