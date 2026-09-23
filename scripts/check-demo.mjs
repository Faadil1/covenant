import { readFile } from "node:fs/promises";

const names=["index","position","covenant","claims","runtime","proofs"];
const pages=Object.fromEntries(await Promise.all(names.map(async name=>[name,await readFile(new URL("../demo/"+name+".html",import.meta.url),"utf8")])));
const app=await readFile(new URL("../demo/app.js",import.meta.url),"utf8");
const state=await readFile(new URL("../demo/state.js",import.meta.url),"utf8");
const css=await readFile(new URL("../demo/styles.css",import.meta.url),"utf8");
const redirects=await readFile(new URL("../demo/_redirects",import.meta.url),"utf8");

const checks=[
 ["six user-app surfaces",names.every(name=>pages[name].includes('data-page="'))],
 ["user-first hero",pages.index.includes("Own the stock.")&&pages.index.includes("SEE THE PROTECTION EVENT")],
 ["wallet connection",app.includes("window.solana")&&pages.index.includes("CONNECT WALLET")],
 ["human protection rules",pages.covenant.includes("Verified issuers only")&&pages.covenant.includes("No permanent token-moving delegate")&&pages.covenant.includes("Small-holder direct redemption")&&pages.covenant.includes("Maximum automatic action")],
 ["representation comparison",pages.claims.includes("Same Apple.")&&pages.claims.includes('id="claimMatrix"')&&app.includes("FITS RULES")],
 ["user decision language",pages.runtime.includes("PROTECTION CHECK")&&app.includes("PROTECTED")&&app.includes("BLOCKED")&&app.includes("SAFE SWITCH")],
 ["exact authorization controls",pages.runtime.includes("CREATE EXACT AUTHORIZATION")&&pages.runtime.includes("APPLY DEMO ACTION")],
 ["technical detail progressive disclosure",pages.runtime.includes("Why this action is safe")],
 ["one-click protection event",pages.runtime.includes("COVENANT RESOLUTION PATH")&&pages.runtime.includes("RUN CURRENT PROTECTION EVENT")&&app.includes("PERMANENT DELEGATE ACTIVE")&&app.includes("SAFE NO ACTION")&&app.includes("scenario=switch")],
 ["local state mutation",state.includes("LOCAL_BROWSER_SANDBOX")&&state.includes("localStorage")],
 ["nonce/version anti-replay",state.includes("Fresh authorization required")],
 ["verified T3 evidence",pages.proofs.includes("35698743841")],
 ["verified T4 evidence",pages.proofs.includes("35733746142")&&pages.proofs.includes("10696822718")],
 ["objective Apple control rule",state.includes("permanentDelegateActive")&&app.includes("claim.permanent_delegate")&&!pages.runtime.includes("CONSENT UNKNOWN")],
 ["objective Apple issuer terms",state.includes("directIssuerRedemptionMinimumUsd: 5000")&&state.includes("directIssuerRedemptionMinimumUsd: 1")&&app.includes("claim.direct_issuer_redemption_minimum_usd")&&app.includes("Direct issuer redemption minimum")],
 ["profile-aware eligibility matrix",state.includes("CURRENT_USER_PROFILE")&&state.includes('"CA-QC"')&&app.includes("NOT USABLE HERE")&&pages.claims.includes("Eligibility is checked separately from representation fit")],
 ["runtime eligibility enforcement",state.includes('"eligibility.user_can_acquire"')&&state.includes("USER_INELIGIBLE_FOR_REPRESENTATION")&&app.includes("This profile can acquire the target representation")],
 ["latest repair is primary runtime evidence",state.includes("repairLatest")&&app.includes('form.profile.value="repairLatest"')&&app.includes("LATEST RECORDED ROUTE")],
 ["latest recorded repair matrix evidence",state.includes("LATEST_REPAIR_REVALIDATION")&&state.includes("35886284296")&&app.includes("LATEST RECORDED REPAIR CHECK")&&pages.claims.includes('id="latestRepairCheck"')],
 ["no false Canada switch claim",pages.claims.includes("both representations currently fail the eligibility gate")&&!pages.claims.includes("AAPLon is available to Canadians")],
 ["truth boundary",pages.proofs.includes("no full COVENANT mainnet deployment")||pages.proofs.includes("no full COVENANT mainnet deployment".toUpperCase())||pages.proofs.includes("no full COVENANT mainnet deployment".toLowerCase())],
 ["responsive CSS",css.includes("@media(max-width:560px)")],
 ["extensionless navigation",names.every(name=>!pages[name].includes('href="./runtime.html"')&&!pages[name].includes('href="./position.html"')&&!pages[name].includes('href="./proofs.html"'))],
 ["Cloudflare redirect guard",!/\/position\s+\/position\.html\s+200/.test(redirects)&&!/\/runtime\s+\/runtime\.html\s+200/.test(redirects)],
];

const failed=checks.filter(([,ok])=>!ok);
if(failed.length)throw new Error("Demo integrity failed: "+failed.map(([n])=>n).join(", "));
console.log(JSON.stringify({schemaVersion:"covenant.user-app-integrity.v1",status:"PASS",checks:checks.map(([n])=>n)},null,2));
