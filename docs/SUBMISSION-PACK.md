# COVENANT — Stocklana submission brief

## One line

**COVENANT protects a user's tokenized-stock position when the token representing that stock changes.**

## User problem

A person can buy Apple exposure on Solana through more than one token representation. Those representations can differ in issuer, rights, token properties and market behavior.

The user should not need to become an RWA infrastructure expert just to answer:

> **Does the token I hold still match the Apple position I intended to own?**

## User application

The Stocklana app is a protected Apple position.

The user:

1. chooses Apple;
2. sets protection rules in normal language;
3. sees whether AAPLx or AAPLon qualifies;
4. runs a Protection Check before an action;
5. receives **PROTECTED / BLOCKED / REVIEW NEEDED**;
6. only a passing action may become one exact authorization.

The interface deliberately hides internal concepts such as Claim Passport, nonce, PDA and evidence root. Those are available only as technical evidence.

## Killer demo

```
My Apple Position
      ↓
AAPLx is current
      ↓
user requires holder consent before collateral lending
      ↓
AAPLx evidence = UNKNOWN
      ↓
BLOCKED
      ↓
AAPLon satisfies the rule
      ↓
exact AAPLx -> AAPLon switch is authorized
      ↓
same Apple Position remains protected
```

## Pyth

Pyth market data is an authorization input, not a price widget.

The ideal Apple path consumes AAPL / AAPLx / AAPLon. Current trial entitlement is pending, so Tesla remains a technical live-market fallback only. Run `35794379825` demonstrates the same evaluator using live Pyth TSLA and executable Jupiter TSLAx pricing.

## Technical evidence

- exact AAPLx / AAPLon identities: verified;
- deterministic fail-closed evaluator: verified;
- governed `USDC -> AAPLx`: Surfpool run `35698743841`;
- replay refused;
- representation switch `AAPLx -> AAPLon`: run `35733746142`, artifact `10696822718`;
- live Pyth/Jupiter evaluator path: run `35794379825`.

## Security boundary

COVENANT is not a ZK or formal proof system. Its security property is bounded, evidence-bound authority: exact target, amount, expiry, evaluator, version, nonce and execution material are bound before the Solana authority boundary may act.

## Current truth boundary

- user app: browser sandbox;
- T3/T4: Surfpool mainnet-shaped fork;
- live-market fallback: Pyth + Jupiter;
- minimal 34,112-byte devnet authority canary: build-ready, public deployment pending free devnet funding;
- full mainnet COVENANT execution: not claimed.

## Startup status

Early hackathon prototype. No customers, design partners or production AUM are claimed yet. External product review and customer discovery are the next validation steps.
