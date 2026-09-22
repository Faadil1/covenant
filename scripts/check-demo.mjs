import { readFile } from "node:fs/promises";

const names = ["index","position","covenant","claims","runtime","proofs"];
const pages = Object.fromEntries(await Promise.all(names.map(async (name) => [
  name,
  await readFile(new URL("../demo/" + name + ".html", import.meta.url), "utf8"),
])));
const app = await readFile(new URL("../demo/app.js", import.meta.url), "utf8");
const state = await readFile(new URL("../demo/state.js", import.meta.url), "utf8");
const css = await readFile(new URL("../demo/styles.css", import.meta.url), "utf8");

const checks = [
  ["six product surfaces", names.every((name) => pages[name].includes('data-page="'))],
  ["runtime writable controls", pages.runtime.includes("GENERATE PROOF") && pages.runtime.includes("EXECUTE LOCAL MUTATION")],
  ["covenant writable controls", pages.covenant.includes("SAVE NEW VERSION")],
  ["position mutation controls", pages.position.includes("FREEZE / UNFREEZE") && pages.position.includes("RESET SANDBOX")],
  ["claim adoption", app.includes("ADOPT_CLAIM")],
  ["proof before power flow", app.includes("authorizePending") && app.includes("executePending")],
  ["local state mutation", state.includes("LOCAL_BROWSER_SANDBOX") && state.includes("localStorage")],
  ["nonce/version anti-replay", state.includes("Position state changed. Fresh proof required.")],
  ["verified T3 evidence", pages.proofs.includes("35698743841")],
  ["verified T4 evidence", pages.proofs.includes("35733746142") && pages.proofs.includes("10696822718")],
  ["mainnet truth boundary", pages.runtime.includes("Not mainnet execution") && pages.proofs.includes("Mainnet financial execution is disabled")],
  ["responsive CSS", css.includes("@media(max-width:560px)")],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) throw new Error("Demo integrity failed: " + failed.map(([n]) => n).join(", "));
console.log(JSON.stringify({schemaVersion:"covenant.demo-integrity.v2",status:"PASS",checks:checks.map(([n])=>n)},null,2));
