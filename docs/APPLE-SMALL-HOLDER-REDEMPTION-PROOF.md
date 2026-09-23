# Apple Small-Holder Redemption Proof

Status: **PASS — objective issuer-term difference bound to exact Apple representations**

Observed: `2026-09-23`

## Owner rule

> **If I ever need to redeem directly with the issuer, the issuer minimum must be $100 or less.**

This is a user-selected portability/liquidity rule. It is not a claim that one issuer is universally better.

## AAPLx — xStocks

Official xStocks documentation states:

- retail users may redeem directly with the issuer;
- direct issuer issuance/redemption requires KYC;
- the minimum direct issuer transaction size is **$5,000**.

Primary source:

https://docs.xstocks.fi/docs/frequently-asked-questions

Bound Claim Passport property:

`directIssuerRedemptionMinimumUsd = 5000`

Under a `$100` owner ceiling:

`5000 <= 100 -> false -> REFUSE`

## AAPLon — Ondo Stocks

Official Ondo Stocks documentation states:

- the minimum amount that can be invested or redeemed is **$1.00**;
- redemption to USDon or USDC has a $1 minimum;
- direct minting/redemption remains subject to Ondo onboarding and eligibility.

Primary source:

https://docs.ondo.finance/ondo-stocks/investing-and-redeeming

Bound Claim Passport property:

`directIssuerRedemptionMinimumUsd = 1`

Under the same `$100` owner ceiling:

`1 <= 100 -> true -> pass this rule`

## Critical eligibility boundary

Passing the redemption-minimum rule does **not** mean the current viewer is eligible to acquire or redeem that representation.

Eligibility is a separate first-class gate.

For a Canada/Quebec profile, current official issuer evidence refuses both:

- xStocks: Canada is explicitly unavailable;
- Ondo Stocks: Canada is explicitly listed as prohibited for subscribing for, acquiring, or redeeming.

Therefore COVENANT must not present the Apple switch as executable for a Canadian user.

The small-holder rule demonstrates a real representation difference for an otherwise eligible user profile; it does not override jurisdiction rules.

## Why this matters

Two tokens can both represent Apple economic exposure while giving a small holder very different direct issuer exit mechanics.

COVENANT can encode that preference before any software receives authority.

## Reproduce

```bash
npm run test:t2
```

See:

- `fixtures/apple-small-holder-covenant.json`
- `test/small-holder-redemption.test.mjs`
