import { readFile } from "node:fs/promises";

const files = await Promise.all([
  readFile(new URL("../demo/index.html", import.meta.url), "utf8"),
  readFile(new URL("../demo/app.js", import.meta.url), "utf8"),
  readFile(new URL("../demo/styles.css", import.meta.url), "utf8"),
]);

const [html, js, css] = files;
const required = [
  ["category statement", html.includes("THE PROGRAMMABLE RUNTIME FOR ECONOMIC OWNERSHIP")],
  ["invariant position", html.includes("APPLE ECONOMIC EXPOSURE")],
  ["covenant machine rules", html.includes("ROUTE IMPACT ≤ 50 BPS")],
  ["claim passport UI", html.includes('id="passportDialog"') && js.includes("passportData")],
  ["verified self-healing UI", html.includes("35733746142") && html.includes("29,421,175 raw AAPLon")],
  ["representation continuity", html.includes("POSITION ID") && html.includes("IDENTITY") && html.includes("PRESERVED")],
  ["explicit passport unknown", js.includes('lendingStatus: "UNKNOWN"')],
  ["judge narrative control", html.includes('id="runDemo"') && js.includes("narrativeStep")],
  ["verified run id", html.includes("35698743841")],
  ["exact AAPLx mint", html.includes("XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp")],
  ["fork truth boundary", html.includes("not a mainnet financial trade")],
  ["verified repair truth boundary", js.includes("Verified T4 self-healing snapshot")],
  ["fail-closed scenario", js.includes("EVIDENCE_STALE · FAIL CLOSED")],
  ["responsive breakpoint", css.includes("@media (max-width: 560px)")],
  ["reduced-motion support", css.includes("prefers-reduced-motion")],
];

const failed = required.filter(([, ok]) => !ok);
if (failed.length) {
  throw new Error("Demo integrity failed: " + failed.map(([name]) => name).join(", "));
}

console.log(JSON.stringify({
  schemaVersion: "covenant.demo-integrity.v1",
  status: "PASS",
  checks: required.map(([name]) => name),
}, null, 2));
