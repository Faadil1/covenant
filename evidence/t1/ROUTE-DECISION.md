# T1 Route Reality Decision — Stocklana execution fixture

Observation: **2026-09-22T06:31:32.589Z**

Source: GitHub Actions run `35695210680`, artifact `covenant-t1-evidence`, schema `covenant.t1-route-reality.v1`.

The probe resolved each exact mint from an official issuer/project source, verified each mint on Solana RPC, then requested executable Jupiter quotes for $25 / $100 / $500. The decision probe used the existing Stocklana rule `priceImpactBps <= 50` at $100.

| Underlying | Claim | Exact mint | $100 impact | Observed route | Decision |
| --- | --- | --- | ---: | --- | --- |
| Apple | AAPLx | `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp` | 0.0971 bps | Raydium CLMM | PASS |
| Apple | AAPLon | `123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo` | 481.31 bps | Meteora DLMM | REFUSE |
| NVIDIA | NVDAx | `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh` | 0.3797 bps | Whirlpool | PASS |
| NVIDIA | NVDAon | `gEGtLTPNQ7jcg25zTetkbmF7teoDLcrfTnQfmn2ondo` | 6029.78 bps | Manifest | REFUSE |

## Build decision

Apple remains the canonical underlying and **AAPLx becomes the T3b execution target**. NVIDIA remains the hot fallback. This is a time-bound execution decision, not a permanent issuer/asset ranking. Route quality can change and must be refreshed before authorization.

Crucially, this observation creates a legitimate state-dependent difference inside one Claim Graph: the same economic intent can accept one exact implementation and refuse another because the executable market truth differs.
