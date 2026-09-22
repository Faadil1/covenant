# T3b PASS — Stocklana Apple ACQUIRE

Date: **2026-09-22**

Status: **PASS on Surfpool mainnet-shaped fork**

Canonical GitHub Actions run: `35698743841`  
Artifact: `covenant-t3b-surfpool-evidence`  
Artifact ID: `10680579722`

## What was proven

COVENANT authorized one exact economic transition only after the deterministic Transition Proof returned `ALLOW`:

```
APPLE economic intent
  -> exact AAPLx Claim Passport
  -> live Jupiter market evidence
  -> Covenant rules PASS
  -> exact CPI commitment
  -> evaluator authorization
  -> Position PDA executes USDC -> AAPLx
  -> postconditions verified
  -> nonce/version advance
  -> Transition Receipt
```

The companion AAPLon proposal used the same underlying economic intent, amount and operator but failed the live market invariant and returned `REFUSE`. No executable proof was created for that proposal.

## Observed execution

- canonical USDC input mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- exact AAPLx output mint: `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp`
- input: `100000000` raw USDC
- committed minimum output: `29188074` raw AAPLx
- settled output: `29334103` raw AAPLx
- AAPLx live price impact: `19.977864498792208 bps`
- AAPLon live price impact: `471.29142825340807 bps`
- Covenant max price impact: `50 bps`
- pre-state version / nonce: `0 / 0`
- settled version / nonce: `1 / 1`
- settled `current_claim_mint`: exact AAPLx mint
- receipt outcome: `EXECUTED`
- replay: rejected with `PositionVersionMismatch`
- replay balances: unchanged

## Bound proof identifiers

- proof hash: `c8caf55eb9759b44fb90bf5a07ca4c258df4e5d3710a378c9a55bc7424e136e9`
- onchain execution commitment: `d4356397392387c8b06f91e355bbe341594a69424d33d34b81bf95757b64c8ee`
- swap invocation hash: `cf5d19ee5dbf4047823ceabe760dce50db646aecff38baf88d2282c37e5e768f`
- final receipt hash: `8773eac511930471553da60df966d34808e5f7db4ef91c8368848a97c0aa9f2f`

## Truth boundary

This is a **fork execution proof**, not a mainnet financial transaction.

Surfpool cheatcodes were used only before authorization to seed fork-only test balances. No hidden state edit was performed after proof authorization began.

Jupiter proposed one setup instruction because its mainnet builder could not observe the fork-only Position token accounts. That setup instruction was not executed. The required Position-owned USDC and AAPLx accounts already existed in the fork and were verified by COVENANT before the exact Jupiter swap CPI.

Mainnet execution remains disabled by default.

## Product significance

This closes the Stocklana T3 technical gate:

> Proof before power.

Authority was attached to the exact permitted state transition rather than to a generic agent wallet.

The run also produced the intended demo contrast:

> Same intent. Same agent authority. Same amount. Different economic truth.

At that observation time AAPLx satisfied the live execution invariant; AAPLon did not.
