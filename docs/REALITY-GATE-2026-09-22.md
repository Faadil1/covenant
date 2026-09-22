# COVENANT — Post-Stocklana Reality Gate
**Date:** 2026-09-22  
**Scope:** company/product durability after the Stocklana proof wedge.  
**Stocklana concept lock:** unchanged.

## Decision

**CONTINUE TO CUSTOMER DISCOVERY — DO NOT YET CLAIM PRODUCT-MARKET FIT.**

The research supports a real and durable problem cluster:

1. financial institutions already pay for mandate compliance, pre-trade controls, wallet governance and transaction policy enforcement;
2. tokenized representations of the same underlying can materially differ in legal/economic rights, issuer exposure, custody, redemption and liquidity;
3. autonomous financial agents create a separate need for scoped, revocable, auditable authority;
4. tokenized capital markets are moving toward multi-asset, multichain and collateral-mobility infrastructure.

However, willingness to pay for **COVENANT as a standalone product** is not yet directly validated.

The company thesis survives only if COVENANT owns the layer that adjacent products do not already own:

> **Economic intent continuity + representation semantics + lifecycle + proof-bound state-transition authority.**

## The durable problem

The long-lived problem is not “which token should I buy?”

It is:

> **How can a person or institution delegate economic action to software while preserving what they actually intend to own, even when instruments, issuers, wrappers, networks, rights, venues and lifecycle conditions change?**

COVENANT should therefore treat:

- token = implementation;
- wallet permission = execution primitive;
- mandate = bounded authority;
- economic intent = stable owner objective;
- Invariant Position = stateful identity of that objective;
- Claim = one concrete implementation;
- Transition Proof = evidence that one exact state transition remains inside the owner's Covenant.

## Evidence that the problem is real

### 1. Instrument semantics are already fragmented

The SEC's January 2026 statement on tokenized securities explicitly distinguishes issuer-sponsored and third-party-sponsored tokenized securities and states that third-party structures can confer materially different rights, obligations and benefits from the referenced security.

That validates the core Claim Passport premise: ticker/underlying equivalence is not enough.

Talos / Coin Metrics similarly describes tokenized equities as a spectrum of issuer-native equity, custodial wrapped equity and derivative exposure, with different legal claims and shareholder rights.

### 2. Mandate compliance is already a budgeted institutional category

BlackRock Aladdin performs pre-trade, trade-cycle and post-trade compliance checks, rule-based suitability and exception management. Charles River IMS provides automated compliance workflows across pre-trade, in-trade and post-execution stages.

This validates that institutions already pay to encode “what must remain true” around portfolio actions.

### 3. Wallet and agent authority is already a budgeted infrastructure category

Fireblocks, Turnkey, Dfns and Safe all provide combinations of:

- transaction limits;
- recipient/contract allowlists;
- approval quorums;
- role separation;
- scoped permissions;
- spending caps;
- automated execution.

Turnkey reports more than 100 million policies created on its platform.

This validates the need for bounded authority, but it also means COVENANT must **not** compete as a generic wallet-policy engine.

### 4. Agent mandates are becoming standardized

Draft ERC-8226 (Regulated Agent Mandate) specifies verified principals, scoped/time-bounded/financially capped agent mandates, execution-time validation, revocation/freeze and execution recording for tokenized regulated assets.

This is substantial overlap with generic “agent mandate” claims.

COVENANT's differentiation cannot be “we give an agent a capped mandate.”

The remaining layer is semantic:

> Does this exact post-state still represent the owner's economic intent, and if the current representation fails, which alternate Claim is admissible without changing that intent?

### 5. Mobility/interoperability is becoming production infrastructure

DTCC describes a multi-asset, multichain future for collateral and is moving tokenized collateral infrastructure toward production. Canton markets real-time asset convertibility and collateral mobility across institutional applications.

This validates representation mobility as a durable environment, but infrastructure such as DTCC/Canton answers primarily **can this asset move?**

COVENANT must answer **should this owner's Position move, to what representation, under which evidence, and with what bounded authority?**

### 6. Community demand appears independently

Public Reddit discussions show builders asking how to let AI agents use wallets without unrestricted control and converging on an external policy/execution layer.

Other Solana discussions surface practical tokenized-equity friction around liquidity, venue fragmentation and wrapper structure.

These are qualitative signals, not market-size proof.

## Competitive boundary

### Fireblocks / Turnkey / Dfns / Safe
They own signing, wallet control, policy enforcement and execution permissions.

**COVENANT should integrate with them, not replace them.**

### Aladdin / Charles River
They own institutional portfolio, risk, compliance and trade-lifecycle workflows.

**COVENANT should not claim that portfolio mandate compliance is novel.**

### ERC-8226 / regulated-agent mandate standards
They formalize principal → agent delegation for regulated assets.

**COVENANT should treat this as an upstream/downstream authority primitive, not as the product thesis.**

### DTCC / Canton
They enable tokenized asset mobility, settlement and interoperability.

**COVENANT should sit above rails and determine admissible economic transitions.**

### ExecutionProof / TreasuryProof
ExecutionProof publicly describes a generic pre-execution architecture covering authority, policy, state, risk, proof and execution. It is early-stage/pilot-oriented but overlaps strongly with generic “proof before execution” positioning.

**COVENANT must not anchor novelty in generic pre-execution verification.**

Also: Remnant Fieldworks has pending U.S. trademark applications for “PROOF BEFORE POWER” and “VERIFICATION BEFORE EXECUTION.” Treat those phrases as competitor-associated language rather than COVENANT's primary commercial identity pending legal review.

### Anoma / intent-centric systems
Intent-centric architecture validates the abstraction of desired end-state over explicit execution path.

**COVENANT's narrower opportunity is economic ownership continuity, representation semantics, lifecycle and bounded financial state transition.**

## COVENANT's defensible product unit

The smallest differentiated unit is:

```
Economic Intent
  -> Invariant Position
  -> Claim Graph
  -> versioned Claim Passports
  -> rights / issuer / custody / market / lifecycle evidence
  -> Covenant
  -> exact proposed post-state
  -> Transition Proof
  -> bounded authority
  -> execution adapter
  -> receipt
  -> continuous re-evaluation
  -> STAY / MIGRATE / HEDGE / FREEZE / EXIT / ESCALATE
```

The key distinction:

```
wallet policy asks:
"May this actor sign this action?"

COVENANT asks:
"Would this exact action leave the owner's economic state inside the intended mandate,
and does the replacement representation preserve the meaning of ownership?"
```

## Best initial customer hypothesis

Do **not** start with retail.

Highest-signal design-partner segments:

1. tokenized-asset platforms supporting multiple wrappers/issuers;
2. institutional digital-asset treasury teams;
3. custodians / institutional wallets adding agentic execution;
4. RWA asset managers and collateral platforms;
5. financial-agent infrastructure serving regulated institutions.

The common qualifying condition is that the customer must have:

- multiple possible representations or venues;
- real policy/mandate constraints;
- expensive failure modes;
- automation pressure;
- a need for auditable delegation.

## Stronger wedge after Stocklana

The next non-hackathon proof should be **tokenized short-duration U.S. Treasury / cash-equivalent exposure**, not another equity.

Why:

- institutional treasury/collateral is a clearer budget holder;
- representation differences still matter;
- liquidity, custody, redemption, issuer and eligibility constraints are measurable;
- the intent is naturally implementation-neutral;
- it proves AAPL is only a fixture;
- it aligns with real collateral-mobility infrastructure.

The test should be:

```
SHORT-DURATION U.S. TREASURY EXPOSURE
    -> multiple real representations
    -> different legal/custody/redemption/liquidity facts
    -> one versioned Covenant
    -> current Claim invalidates
    -> alternate Claim qualifies
    -> fresh proof
    -> controlled migration or explicit ESCALATE
```

## Kill tests

COVENANT should be stopped, absorbed into another project, or reduced to a feature if customer discovery shows any of these:

1. customers can express the whole problem adequately using existing Aladdin/Charles River + Fireblocks/Turnkey rules without bespoke semantic infrastructure;
2. “representation drift” rarely causes meaningful operational, financial or compliance cost;
3. users do not trust or want automated representation mobility even with bounded proof;
4. economic equivalence cannot be made sufficiently objective/auditable for target use cases;
5. legal/tax/custody constraints make migration so exceptional that a runtime has little repeated use;
6. buyers value only the receipt/audit layer, where incumbents already have strong products;
7. switching from Apple equities to Treasury exposure requires rewriting the COVENANT core rather than mostly adapters, Passports and rules.

## Success criteria for the next gate

Advance from “technical proof” to “company candidate” only after:

- 10–15 interviews with qualified institutional/RWA/treasury/custody operators;
- at least 5 report a recurring version of the problem without being led to it;
- at least 3 can identify a current workflow, incident, manual control or cost tied to it;
- at least 2 agree to a design-partner workflow or provide real non-sensitive examples/data;
- at least 1 is willing to discuss a paid pilot or procurement path;
- the Treasury portability test reuses the COVENANT core with adapters/rules rather than architecture replacement.

## Current verdict

### Real Problem
**Supported.** Rights/wrapper fragmentation, mandate enforcement, agent authority and asset mobility are all independently real.

### Real User
**Plausible, not yet validated.** Institutional treasury, RWA infrastructure, asset managers, custodians and financial-agent platforms are the best hypotheses.

### 5–20 Year Durability
**Supported at the problem level.** The exact chains/tokens/vendors may disappear; economic mandates, representation changes, lifecycle events and delegated software authority are likely to remain.

### Willingness to Pay
**Indirect evidence only.** Adjacent categories have substantial enterprise budgets, but COVENANT-specific WTP is unproven.

### Killer Demo
**Supported.** Stocklana proves that two implementations of one underlying can yield different admissibility and that representation can change while Position identity survives.

### Native Advantage
**Supported if kept narrow.** Onchain exactness, atomic settlement, state versioning, proof-bound authority and receipts make the concept concrete; blockchain itself is not the product identity.

## Non-regression rule

Do not regress COVENANT into:

- generic wallet policy;
- generic AI governance;
- generic “proof before execution” middleware;
- token router;
- tokenization platform;
- portfolio dashboard;
- simple mandate registry.

The long-term identity is:

> **COVENANT — the economic-intent continuity and state-transition runtime.**

“Economic intent is the interface” remains the strongest current product framing.

---

## Public sources reviewed

- SEC — Statement on Tokenized Securities, 2026-01-28  
  https://www.sec.gov/newsroom/speeches-statements/corp-fin-statement-tokenized-securities-012826-statement-tokenized-securities
- BlackRock Aladdin — Compliance  
  https://www.blackrock.com/aladdin/benefits/compliance
- Fireblocks — Governance and Policies Engine  
  https://www.fireblocks.com/platforms/governance-and-policies
- Fireblocks — Agentic Digital Asset Infrastructure  
  https://www.fireblocks.com/solutions/agentic-digital-asset-infrastructure
- Turnkey — 100M+ policies  
  https://www.turnkey.com/blog/100m-policies--turnkey-protecting-transactions
- Dfns — Policy Engine  
  https://dfns.co/policy-engine
- Safe — Smart Account Modules  
  https://docs.safe.global/advanced/smart-account-modules
- ERC-8226 — Regulated Agent Mandate  
  https://eips.ethereum.org/EIPS/eip-8226
- DTCC — Collateral AppChain  
  https://www.dtcc.com/insights/2026/the-dtcc-collateral-appchain-from-experiment-to-production-infrastructure
- Canton — Real-World Asset Mobility  
  https://www.canton.network/real-world-asset-mobility
- ExecutionProof / Remnant Fieldworks  
  https://executionproof.io/
- TreasuryProof  
  https://treasuryproof.com/
- Talos / Coin Metrics — Spectrum of Tokenized Stock Exposure  
  https://www.talos.com/insights/state-of-the-network-369
- Reddit / r/ethdev — AI wallet authority discussion  
  https://www.reddit.com/r/ethdev/comments/1vxnws5/how_do_we_let_an_ai_use_a_wallet_without_giving/
- Reddit / r/solana — tokenized equity structure discussion  
  https://www.reddit.com/r/solana/comments/1racisn/tokenized_equities_on_solana_onboarding_a/
