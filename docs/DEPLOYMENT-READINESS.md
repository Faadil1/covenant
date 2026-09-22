# Demo deployment readiness

The repository is prepared for a static Vercel deployment from the repository root.

`vercel.json` rewrites the root URL to the canonical `demo/index.html` vertical slice while preserving the demo assets.

No server secret, wallet key or mainnet execution capability is required by the demo.

## Expected public behavior

- `/` -> proof-first COVENANT demo;
- “Verified Stocklana proof” uses the recorded T3b fork snapshot;
- invalidation/repair modes are explicitly synthetic;
- “VIEW PROOF” exposes the canonical fork proof summary;
- “RUN DEMO” plays the short judge narrative.

## Deployment truth boundary

A public deployment is a presentation surface only. It does not:

- sign Solana transactions;
- hold wallet authority;
- call the governed executor;
- claim current/live market values;
- enable mainnet financial execution.

The repository's technical proof remains the authority for T1–T3 claims.
