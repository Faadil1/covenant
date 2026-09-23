# 90-Second Judge Demo — User Application

## 0:00–0:12 — The user problem

Open on **Portfolio**.

> “I want Apple exposure on Solana. I should not need to audit every token mint, issuer rule, jurisdiction restriction and route myself.”

Click **SEE THE PROTECTION EVENT**.

> “COVENANT protects the economic position rather than blindly trusting whichever token currently represents it.”

## 0:12–0:25 — One owner rule

Open **Protection** briefly.

Point to:

**No permanent token-moving delegate.**

> “This is a real Token-2022 control. A PermanentDelegate is a mint-level authority that can transfer or burn tokens for any account of that mint, and the holder cannot revoke it.”

Keep the route-impact ceiling and automatic-action cap visible.

## 0:25–0:42 — Representation fit is not user eligibility

Open **Representations**.

> “These are two real Apple representations on Solana. Mainnet inspection found an active PermanentDelegate on AAPLx. AAPLon has no PermanentDelegate extension.”

Point to the two separate decision rows:

**FITS YOUR REPRESENTATION RULES**

and

**USABLE FOR THIS PROFILE NOW**

> “AAPLon fits this ownership rule better, but that does not mean I can use it. For the current Canada / Québec profile, both representations fail the issuer eligibility gate.”

Point to the latest recorded repair check:

**977.23 bps route impact > 500 bps owner ceiling → SAFE NO ACTION.**

## 0:42–1:06 — The protection event

Open **Check** and click **RUN CURRENT PROTECTION EVENT**.

The journey should read:

**AAPLx**
→ **RULE MISMATCH**
→ **AAPLon · RULE FIT**
→ **NOT ELIGIBLE HERE**
→ **977.23 BPS > 500 BPS**
→ **SAFE NO ACTION**

> “My Apple intent did not change. COVENANT found a candidate representation that satisfies the mint-control rule, then separately checked whether I can use it and whether the exact route is acceptable. Those gates fail, so it creates no authority.”

Point to **Correct outcome: no authority.**

> “Doing nothing is a successful protection outcome.”

## 1:06–1:20 — Proof that SAFE SWITCH is real when every gate passes

Open **Evidence**.

Point to the historical governed AAPLx → AAPLon migration:

- run `35733746142`
- artifact `10696822718`
- Position identity preserved
- version / nonce advanced
- replay protection evidenced

> “COVENANT has also proven the opposite branch: when the bounded transition passes, it can authorize one exact representation switch and consume that authority once. The current user journey does not pretend those historical conditions still hold.”

## 1:20–1:30 — Close

Return to the Protection Event result.

> “COVENANT is not a swap bot. It separates representation fit, user eligibility and route viability, then gives software power only when all three are true.”

End on:

**OWN THE STOCK. NOT THE TOKEN RISK.**

## Truth boundary

- The public app is a browser sandbox; any applied demo action mutates local state only.
- The objective PermanentDelegate difference comes from the exact mainnet Token-2022 mints; workflow run `35884969091`, artifact `10761673239`.
- Canada / Québec eligibility is bound separately from representation fit using current issuer evidence stored in the demo state.
- The latest recorded Apple repair revalidation is run `35886284296`, artifact `10762099429`: route impact `977.2256517937228 bps` versus a `500 bps` ceiling, yielding `SAFE_NO_ACTION`.
- The historical governed representation migration is run `35733746142`, artifact `10696822718`.
- No full COVENANT mainnet deployment is claimed.
- COVENANT does not claim that AAPLx is universally unsafe or that AAPLon is universally superior.
