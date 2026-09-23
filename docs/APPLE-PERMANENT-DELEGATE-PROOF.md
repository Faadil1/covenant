# Apple PermanentDelegate Proof

Status: **PASS — objective exact-mint difference verified on Solana mainnet**

## Evidence

Workflow run: `35884969091`  
Artifact: `10761673239`  
Observed: `2026-09-23T15:54:35.225Z`

The probe reads the exact AAPLx and AAPLon mint accounts from Solana mainnet, decodes Token-2022 extensions with `@solana/spl-token`, and records the result.

Reproduce:

```bash
npm run probe:apple-reality
```

## AAPLx

Mint:

`XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp`

Observed:

- Token-2022: YES
- PermanentDelegate extension: PRESENT
- active delegate: YES
- delegate: `5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq`

## AAPLon

Mint:

`123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo`

Observed:

- Token-2022: YES
- PermanentDelegate extension: ABSENT
- active delegate: NO

## Solana semantics

Official Solana documentation:

https://solana.com/docs/tokens/extensions/permanent-delegate

A PermanentDelegate is a mint-level authority that can authorize transfers and burns for any token account of the mint. Token-account owners cannot revoke that permanent delegate from their token accounts.

## COVENANT rule

The Stocklana demo uses the owner-selected rule:

> **No active permanent token-moving delegate.**

Therefore:

```
AAPLx   -> permanentDelegateActive = true  -> REFUSE
AAPLon  -> permanentDelegateActive = false -> continue
```

This difference is bound into the Claim Passports as `ONCHAIN_DETERMINISTIC` evidence.

## Truth boundary

This proof does **not** say AAPLx is universally unsafe or AAPLon universally superior.

It proves one narrower fact:

> the exact representations differ on an onchain mint authority property that an owner may explicitly reject.

AAPLon has other Token-2022 controls. Passing this rule is only one gate; eligibility, route quality and exact execution authority are separate gates.
