# 90-Second Judge Demo — User Application

## 0:00–0:12 — The user problem

Open on **Portfolio**.

> “I want Apple exposure on Solana. I should not need to audit every token mint and issuer control myself.”

Click **SEE THE PROTECTION EVENT**.

> “Protect my Apple position. I tell COVENANT what properties I am willing to accept, and it protects the economic position rather than blindly trusting the current token.”

## 0:12–0:27 — One human rule

Open **Protection** briefly.

Point to:

**No permanent token-moving delegate.**

> “This is a real Token-2022 control. A PermanentDelegate is a mint-level authority that can transfer or burn tokens for any account of that mint, and the holder cannot revoke it.”

Keep the other rules visible: verified issuer, route-impact limit, automatic-action cap.

## 0:27–0:44 — Same Apple, objectively different mint controls

Open **Representations**.

> “These are two real Apple representations on Solana. Mainnet inspection of the exact mints found an active PermanentDelegate on AAPLx. AAPLon has no PermanentDelegate extension.”

Point to **BLOCKED / QUALIFIES**.

> “That does not mean one issuer is universally better. It means these two representations are objectively different on a property I chose to care about.”

## 0:44–0:58 — The killer moment

Open **Check** / **REPRESENTATION NEEDS SWITCH**.

Show:

**AAPLx → PERMANENT DELEGATE ACTIVE → CHECK AAPLon**

Run **CHECK PROTECTION**.

> “My Apple intent did not change. The current representation violates my rule, so COVENANT refuses it and checks an alternative.”

Point to **SAFE SWITCH** for AAPLon.

## 0:58–1:18 — Evidence before authority

Create the exact authorization.

> “A passing decision is still not open-ended wallet power. COVENANT binds this exact representation, route, amount, expiry, Position version and nonce before authority exists.”

Confirm, then apply the demo action.

> “The action is consumed once. Version and nonce advance, so stale authorization cannot be replayed.”

Open **Why this action is safe** only briefly.

## 1:18–1:30 — Close

Return to **My Position**.

> “The token representation changed. The Apple position and the owner's rule stayed intact. That is COVENANT.”

End on:

**OWN THE STOCK. NOT THE TOKEN RISK.**

## Truth boundary

- The browser action mutates local sandbox state.
- The objective PermanentDelegate difference comes from the exact mainnet Token-2022 mints; workflow run `35884969091`, artifact `10761673239`.
- Verified representation migration and replay protections are evidenced by Surfpool mainnet-shaped fork runs.
- No full COVENANT mainnet deployment is claimed.
- COVENANT does not claim that AAPLx is universally unsafe or that AAPLon is universally superior.
