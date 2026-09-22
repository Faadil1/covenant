# COVENANT Demo UX v1

Status: **VERTICAL SLICE — BUILD AFTER T1–T3 PASS**

The first demo surface must explain COVENANT's category shift in under 20 seconds without collapsing into a stock terminal, agent wallet, compliance dashboard or generic router.

## Primary jury story

1. **Own the intention** — the user has an Invariant Position: `APPLE ECONOMIC EXPOSURE`.
2. **See implementation plurality** — AAPLx and AAPLon are exact Claim Graph nodes under the same economic intent.
3. **See why one qualifies** — exact evidence, not ticker similarity, determines admissibility.
4. **See authority emerge from proof** — ALLOW alone is not executable; one exact transition is committed.
5. **See the state change** — Position-owned USDC becomes exact AAPLx.
6. **See replay fail** — version/nonce advance kills reused authority.
7. **See self-healing direction** — if evidence invalidates the current representation, the Position survives and COVENANT can propose another qualifying representation.

## Above-the-fold requirement

The first viewport should contain:

- category statement: “The programmable runtime for economic ownership”;
- product thesis: “Own the intention. Let implementations change.”;
- one stable Invariant Position;
- explicit `IN COVENANT` state.

Avoid opening with a market chart, wallet balance, asset table or AI chat.

## Visual language

The demo uses an editorial/industrial control-system language rather than generic SaaS cards:

- warm paper field rather than dark-blue AI gradients;
- visible structural rules and stamps;
- electric signal color only for state/decision emphasis;
- monospace for machine truth, sans/serif contrast for product thesis;
- Claim Graph represented as a structural relationship, not a token list;
- receipts look like evidence artifacts, not success toasts.

## Verified vs synthetic truth

The default state reproduces the verified Stocklana T3b fork proof snapshot from GitHub Actions run `35698743841`.

The “Evidence invalidation” and “Representation repair preview” modes are explicitly labeled synthetic demo scenarios. Synthetic values must never be presented as live market observations.

## Demo interaction

The scenario selector has three states:

- **Verified Stocklana proof** — AAPLx ALLOW, AAPLon REFUSE.
- **Evidence invalidation** — AAPLx evidence deliberately becomes stale; both claims refuse and no authority exists.
- **Representation repair preview** — demonstrates the product direction: a replacement claim may be proposed, but requires fresh evidence and a new proof before migration.

The repair preview is intentionally not labeled EXECUTED because a verified migration has not yet been proven.

## Next visual gate

After this vertical slice works in-browser, the next design pass should improve:

- motion grammar for `PROPOSE -> PROVE -> AUTHORIZE -> EXECUTE`;
- Claim Passport detail view;
- Covenant compiler / intent creation surface;
- continuous re-evaluation timeline;
- repair/migration interaction;
- responsive evidence drawer;
- demo narrative timing for a 60–90 second judge walkthrough.

Do not add decorative AI imagery. The proof objects and state transitions are the visual content.
