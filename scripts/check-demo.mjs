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
  ["verified run id", html.includes("35698743841")],
  ["exact AAPLx mint", html.includes("XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp")],
  ["fork truth boundary", html.includes("not a mainnet financial trade")],
  ["synthetic disclaimer", js.includes("Synthetic repair preview only")],
  ["fail-closed scenario", js.includes("EVIDENCE_STALE · FAIL CLOSED")],
  ["responsive breakpoint", css.includes("@media (max-width: 560px)")],
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
