# T3a — Authority Boundary Evidence

**Status:** PASS  
**Verified:** 2026-09-22  
**GitHub Actions run:** 35692639745  
**Commit under test:** e9595bb1432cc89943ecd76f216d945c04850fe1

The COVENANT Anchor program was built under Solana 3.1.10 / Anchor 1.1.2 and executed in LiteSVM.

## Passing tests

1. `allowed_proof_moves_real_value_and_replay_fails`
   - evaluator-approved transition moves exactly the committed value;
   - position nonce/version advance;
   - receipt commitment persists;
   - consumed proof cannot execute twice.

2. `wrong_evaluator_and_destination_substitution_cannot_move_value`
   - signer substitution fails;
   - settlement-destination substitution fails;
   - balances and nonce remain unchanged.

3. `freeze_is_an_onchain_kill_switch_and_invalidates_pending_proof`
   - owner freeze mutates position version/nonce;
   - an otherwise valid pending proof becomes unusable;
   - no value moves.

4. `covenant_amendment_preserves_position_identity_and_kills_old_proof`
   - the stable Invariant Position PDA survives policy amendment;
   - Covenant hash/version authority changes;
   - old proof fails;
   - a new proof under the amended Covenant succeeds.

## Truth boundary

This is a **real program-level Solana state transition in LiteSVM**, not a mainnet trade and not yet the exact Apple token acquisition.

T3 is not closed until T3b proves the same governed boundary around the exact Stocklana path:

`Position-owned USDC → exact qualifying Apple claim → verified receipt`

on a mainnet-shaped fork/devnet/mainnet-safe path, with the corresponding refused transition unable to settle.
