import { readFile } from "node:fs/promises";

const files = {
  readme: await readFile(new URL("../README.md", import.meta.url), "utf8"),
  submission: await readFile(new URL("../docs/SUBMISSION-PACK.md", import.meta.url), "utf8"),
  demoScript: await readFile(new URL("../docs/DEMO-SCRIPT-90S.md", import.meta.url), "utf8"),
  security: await readFile(new URL("../SECURITY.md", import.meta.url), "utf8"),
  t4: await readFile(new URL("../docs/T4-SELF-HEALING.md", import.meta.url), "utf8"),
};

const checks = [
  ["category thesis", files.submission.includes("programmable runtime for economic ownership")],
  ["non-router differentiation", files.submission.includes("Why this is not a router")],
  ["solana load-bearing", files.submission.includes("Why Solana is load-bearing")],
  ["t3 canonical run", files.submission.includes("35698743841")],
  ["t4 canonical run", files.submission.includes("35733746142")],
  ["t4 artifact", files.submission.includes("10696822718")],
  ["fork truth boundary", files.submission.includes("No mainnet financial transaction is claimed")],
  ["demo under 90 seconds", files.demoScript.includes("1:18–1:30")],
  ["unknown fail closed", files.security.includes("There is no UNKNOWN -> TRUE coercion")],
  ["known revocation gap", files.security.includes("Known hardening gap")],
  ["t4 status pass", files.t4.includes("Status: **PASS")],
  ["readme t4 pass", files.readme.includes("T1–T4 PASS")],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  throw new Error("Submission readiness failed: " + failed.map(([name]) => name).join(", "));
}

console.log(JSON.stringify({
  schemaVersion: "covenant.submission-readiness.v1",
  status: "PASS",
  checks: checks.map(([name]) => name),
}, null, 2));
