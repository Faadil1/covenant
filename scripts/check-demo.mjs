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
 ["human protection rules",pages.covenant.includes("Verified issuers only")&&pages.covenant.includes("No permanent token-moving delegate")&&pages.covenant.includes("Maximum automatic action")],
 ["representation comparison",pages.claims.includes("Same Apple.")&&app.includes("QUALIFIES")],
 ["user decision language",pages.runtime.includes("PROTECTION CHECK")&&app.includes("PROTECTED")&&app.includes("BLOCKED")&&app.includes("SAFE SWITCH")],
 ["exact authorization controls",pages.runtime.includes("CREATE EXACT AUTHORIZATION")&&pages.runtime.includes("APPLY DEMO ACTION")],
 ["technical detail progressive disclosure",pages.runtime.includes("Why this action is safe")],
 ["one-click killer scenario",pages.runtime.includes("PERMANENT DELEGATE ACTIVE")&&pages.runtime.includes("ONCHAIN CONTROL FOUND")&&app.includes("scenario=switch")],
 ["local state mutation",state.includes("LOCAL_BROWSER_SANDBOX")&&state.includes("localStorage")],
 ["nonce/version anti-replay",state.includes("Fresh authorization required")],
 ["verified T3 evidence",pages.proofs.includes("35698743841")],
 ["verified T4 evidence",pages.proofs.includes("35733746142")&&pages.proofs.includes("10696822718")],
 ["objective Apple control rule",state.includes("permanentDelegateActive")&&app.includes("claim.permanent_delegate")&&!pages.runtime.includes("CONSENT UNKNOWN")],
 ["truth boundary",pages.proofs.includes("no full COVENANT mainnet deployment")||pages.proofs.includes("no full COVENANT mainnet deployment".toUpperCase())||pages.proofs.includes("no full COVENANT mainnet deployment".toLowerCase())],
 ["responsive CSS",css.includes("@media(max-width:560px)")],
 ["extensionless navigation",names.every(name=>!pages[name].includes('href="./runtime.html"')&&!pages[name].includes('href="./position.html"')&&!pages[name].includes('href="./proofs.html"'))],
 ["Cloudflare redirect guard",!/\/position\s+\/position\.html\s+200/.test(redirects)&&!/\/runtime\s+\/runtime\.html\s+200/.test(redirects)],
];

const failed=checks.filter(([,ok])=>!ok);
if(failed.length)throw new Error("Demo integrity failed: "+failed.map(([n])=>n).join(", "));
console.log(JSON.stringify({schemaVersion:"covenant.user-app-integrity.v1",status:"PASS",checks:checks.map(([n])=>n)},null,2));
