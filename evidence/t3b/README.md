# T3b — Jupiter V2 build commitments

This directory stores time-bound execution commitments for the exact Stocklana Apple ACQUIRE path.

Run with the Position PDA as the taker and a Position-owned AAPLon token account as the destination.

The probe calls Jupiter Swap API V2 /build and does not sign or submit anything. It validates exact mint, amount, slippage and Jupiter program constraints, hashes ordered account metas and instruction bytes, and writes an evidence packet.

A build response is routing material, not authority. T2 must return ALLOW, and the COVENANT program must enforce the exact commitment before any state change.

Never commit API keys or wallet/private-key material.
