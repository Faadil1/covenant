# COVENANT — Treasury Portability Spike
**Status:** Treasury-T1/T2/T3 semantic portability PASS; Treasury-T4/T5 remain open.  
**Purpose:** test whether the COVENANT core survives removal of AAPL.

## Portability question

Replace:

```
APPLE ECONOMIC EXPOSURE
```

with:

```
SHORT-DURATION U.S. TREASURY / CASH-EQUIVALENT EXPOSURE
```

Then ask:

> Can the existing COVENANT runtime model this without changing its core abstractions?

The spike is successful only if the changes are mostly:

- Claim Passports;
- evidence adapters;
- execution adapters;
- Covenant rules;
- lifecycle adapters.

A rewrite of Invariant Position / Transition Proof / authority / receipt semantics is a portability failure.

## Preliminary real Claim Graph

### Claim A — USTB / Superstate
**Economic object:** Invesco Short Duration US Government Securities Fund.  
**Structure:** U.S. Delaware Statutory Trust series.  
**Eligibility:** Accredited Investors and Qualified Purchasers in supported jurisdictions.  
**Representations:** tokenized shares on Ethereum, Solana and Plume, plus book-entry shares.  
**Liquidity:** subscriptions/redemptions through USD or USDC; current materials describe same-day liquidity, with immediate USDC redemption when liquidity is available. Protocol redemption is subject to availability/dynamic limits.  
**Custodian:** BNY.  
**Important semantic:** the same fund exposure already exists through multiple representations.  
**Sources:**  
https://superstate.com/assets/ustb  
https://superstate.com/assets/ustb

### Claim B — BENJI / Franklin OnChain U.S. Government Money Fund
**Economic object:** shares of FOBXX, a U.S.-registered government money market fund.  
**Record of ownership:** public blockchain is used as the official system of record.  
**Representations/networks:** BENJI is supported across multiple public networks; current institutional availability includes Ethereum, Base, Solana, BNB Smart Chain and others in the Benji ecosystem.  
**Transfer:** P2P transfer functionality exists between eligible shareholders.  
**Utility:** BENJI-issued tokenized money-market fund shares are already used in institutional off-exchange collateral programs.  
**Important semantic:** one regulated fund position can move across network and collateral contexts without ceasing to be the same fund share.  
**Sources:**  
https://digitalassets.franklintempleton.com/benji/  
https://www.franklintempleton.com/press-releases/news-room/2026/franklin-templeton-stellar-development-foundation-mark-five-years-of-benji-the-first-u.s-registered-tokenized-money-market-fund  
https://www.franklintempleton.com/press-releases/news-room/2026/franklin-templeton-and-binance-advance-strategic-collaboration-with-institutional-off-exchange-collateral-program

### Claim C — TBILL / OpenEden
**Economic object:** economic interest in a regulated professional fund holding short-dated U.S. T-Bills and a small USD allocation.  
**Underlying management/custody:** BNY investment management / BNY custody.  
**Transfer:** only between whitelisted investors.  
**Mint/redeem:** onboarded/whitelisted investors; redemption goes through a queue and is typically processed next U.S. business day.  
**Legal claim:** holders are contractually entitled to the redemption value of their proportional interest in fund assets.  
**Important semantic:** transferability and redemption are materially more constrained than a permissionless bearer asset.  
**Sources:**  
https://docs.openeden.com/tbill  
https://docs.openeden.com/tbill/product-structuring  
https://docs.openeden.com/tbill/redemptions

### Claim D — USDY / Ondo
**Economic object:** yield-bearing economic exposure to short-term U.S. Treasuries and bank deposits.  
**Legal form:** USDY is not itself a U.S. Treasury and does not confer rights to hold or receive the underlying Treasuries.  
**Transfer:** designed as a permissionless bearer asset.  
**Primary mint/redeem eligibility:** limited to non-U.S. persons/entities under Regulation S, with additional restrictions.  
**Multichain:** currently expanding across networks including BNB Chain and Tempo.  
**Important semantic:** transferability is broader than primary issuance/redemption eligibility, making “can hold/transfer” distinct from “can mint/redeem.”  
**Sources:**  
https://ondo.finance/usdy  
https://ondo.finance/  
https://ondo.finance/blog/usdy-is-live-on-bnb-chain

### Claim E — BUIDL / BlackRock, tokenized by Securitize
**Economic object:** BlackRock USD Institutional Digital Liquidity Fund, backed by cash, U.S. Treasury bills and repo.  
**Utility:** accepted in institutional collateral workflows; liquidity integrations include UniswapX and exchange/custody frameworks.  
**Multichain:** Securitize has expanded BUIDL across additional networks.  
**Important semantic:** the fund is increasingly used not merely as a holding but as collateral and trading infrastructure.  
**Research gap before Passport:** exact current eligibility, redemption constraints and canonical share-class/network mapping must be retrieved from authoritative fund documentation.  
**Sources:**  
https://investors.securitize.io/news/news-details/2026/OKX-BlackRock-and-Standard-Chartered-Launch-Joint-Framework-to-Establish-New-Utility-for-Tokenized-Real-World-Assets/default.aspx  
https://investors.securitize.io/news/news-details/2026/Uniswap-Labs-and-Securitize-Collaborate-to-Unlock-Liquidity-Options-for-BlackRocks-BUIDL-02-11-2026/default.aspx

### Claim F — JTRSY / Janus Henderson Anemoy Treasury Fund
**Economic object:** institutional tokenized Treasury exposure.  
**Utility:** made eligible collateral in M0’s stablecoin infrastructure through Centrifuge.  
**Important semantic:** collateral eligibility can become a policy-relevant property independently of basic ownership.  
**Research gap before Passport:** exact legal structure, redemption, transfer and network facts require primary-document verification.  
**Source:**  
https://centrifuge.io/blog/m0-centrifuge

## Why this graph is stronger than another stock

The Claims are not merely different tickers.

They differ along dimensions that institutions actually care about:

- fund share vs economic-exposure token;
- investor eligibility;
- primary issuance/redemption eligibility;
- transfer permissioning;
- redemption timing;
- book-entry vs token form;
- network availability;
- custody;
- collateral eligibility;
- legal claim to underlying fund assets;
- liquidity mechanism.

That is the exact semantic surface COVENANT claims to govern.

## Candidate Treasury Covenant

Do not encode this as production policy yet.

Research prototype:

```
INTENT
Maintain short-duration USD government / cash-equivalent exposure.

HARD INVARIANTS
- exact issuer / fund identity verified;
- underlying exposure class verified;
- holder jurisdiction / eligibility compatible;
- required redemption right available;
- maximum redemption horizon <= owner mandate;
- approved custodian / transfer-agent regime;
- no UNKNOWN on legal claim / redemption / eligibility;
- route / conversion cost below mandate;
- post-state concentration below mandate;
- current use (hold / collateral / settlement) permitted for that Claim.

AUTHORITY
- STAY autonomous;
- MIGRATE only among Claims pre-approved by owner mandate;
- FREEZE autonomous;
- EXIT within settlement-asset allowlist;
- any intent substitution -> ESCALATE.
```

## Required new Passport fields

The Apple Passport should generalize rather than be replaced.

Add evidence-bearing fields for:

- `economicExposureClass`;
- `legalInstrumentType`;
- `holderLegalClaim`;
- `eligibleInvestorClasses`;
- `eligibleJurisdictions`;
- `primaryMintEligibility`;
- `primaryRedemptionEligibility`;
- `transferRestrictions`;
- `redemptionMechanism`;
- `redemptionExpectedTiming`;
- `redemptionLiquidityConditions`;
- `custodian`;
- `transferAgentOrRecordkeeper`;
- `collateralEligibility[]`;
- `networkRepresentations[]`;
- `lifecycleEvents[]`.

Each field must retain:
- status;
- evidence class;
- observed/verified time where meaningful;
- authoritative source;
- payload hash / version.

## T1–T5 portability gates

### Treasury-T1 — semantic reality
At least three Claims populated from authoritative sources with explicit UNKNOWN where evidence is absent.

### Treasury-T2 — deterministic difference
One Covenant must produce different outcomes across Claims for a real reason such as eligibility, redemption horizon or collateral eligibility — not a fabricated route number.

### Treasury-T3 — same runtime
No change to the core meaning of:
- Invariant Position;
- evaluate → prove → authorize;
- version/nonce;
- Transition Proof;
- receipt.

### Treasury-T4 — lifecycle / mobility
Demonstrate:
```
current Claim
 -> evidence / mandate violation
 -> OUT_OF_COVENANT
 -> alternate real Claim qualifies
 -> fresh proof
 -> MIGRATE / EXIT / ESCALATE
```

### Treasury-T5 — customer reality
At least one design partner confirms that the modeled transition resembles a real workflow they currently manage.

## Immediate research order

1. USTB — easiest cross-representation test because token + book-entry + multi-network are explicit.
2. TBILL — strongest transfer/redemption constraints.
3. USDY — strongest contrast between permissionless transfer and restricted primary mint/redeem.
4. BENJI — strongest regulated multi-network + collateral example.
5. BUIDL — strongest institutional collateral/liquidity example once canonical fund docs are captured.
6. JTRSY — useful collateral-eligibility node.

## Portability verdict so far

**SEMANTIC PORTABILITY PASS. CUSTOMER REALITY STILL OPEN.**

Three authoritative Treasury Claim Passports now evaluate through the unchanged core runtime:

- USTB → ALLOW under the research same-day U.S.-qualified mandate;
- TBILL → REFUSE because typical redemption is next 1 U.S. business day;
- USDY → REFUSE because primary mint/redeem is non-U.S.-only and its legal-claim model is exposure-only rather than a fund/share claim.

The existing `src/policy/evaluator.mjs` and `src/proof/transition-proof.mjs` were not modified for this domain shift.

Canonical portability CI run: `35758958490` — PASS.

The remaining gate is no longer “can COVENANT survive removal of Apple?” It can at the semantic/proof level. The remaining question is whether a real operator recognizes this transition as a repeated workflow worth paying to control.
