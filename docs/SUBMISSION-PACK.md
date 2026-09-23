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

User eligibility is a separate first-class gate. A valid representation does not become usable merely because its mint and issuer are verified. Jurisdiction, investor class, venue and operation-specific evidence must also permit the action; UNKNOWN fails closed.

## Killer demo

```
My Apple Position
      ↓
AAPLx is current
      ↓
owner rule: no active permanent token-moving delegate
      ↓
mainnet evidence: AAPLx = ACTIVE PermanentDelegate
      ↓
BLOCKED
      ↓
mainnet evidence: AAPLon = no PermanentDelegate extension
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


## Reality audit

The Apple case is a reference case, not COVENANT's product boundary. The killer demo now uses a concrete difference observed directly on the exact Token-2022 mints.

Mainnet workflow run `35884969091` found:

- AAPLx: active PermanentDelegate;
- AAPLon: no PermanentDelegate extension.

Solana defines a PermanentDelegate as a mint-level authority that can authorize transfers and burns for any token account of the mint and cannot be revoked by token-account owners.

The user-selected rule is therefore factual and inspectable: **no active permanent token-moving delegate**.

That still does **not** make AAPLon universally better or AAPLx universally unsafe. It proves only that the two exact representations differ on a user-selected authority property.

See `research/REPRESENTATION-REALITY-AUDIT-V1.md`.
