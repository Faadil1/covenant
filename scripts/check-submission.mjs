import { readFile } from "node:fs/promises";

const files = {
  readme: await readFile(new URL("../README.md", import.meta.url), "utf8"),
  submission: await readFile(new URL("../docs/SUBMISSION-PACK.md", import.meta.url), "utf8"),
  demoScript: await readFile(new URL("../docs/DEMO-SCRIPT-90S.md", import.meta.url), "utf8"),
  security: await readFile(new URL("../SECURITY.md", import.meta.url), "utf8"),
  t4: await readFile(new URL("../docs/T4-SELF-HEALING.md", import.meta.url), "utf8"),
};

const checks = [
  ["category thesis", files.submission.includes("COVENANT lets autonomous software change a tokenized asset's representation")],
  ["non-router differentiation", files.submission.includes("a router can find a path")],
  ["solana load-bearing", files.submission.includes("Why Solana is load-bearing")],
  ["t3 canonical run", files.submission.includes("35698743841")],
  ["t4 canonical run", files.submission.includes("35733746142")],
  ["t4 artifact", files.submission.includes("10696822718")],
  ["fork truth boundary", files.submission.includes("Full mainnet COVENANT execution: not claimed") && files.submission.includes("Surfpool mainnet-shaped fork")],
  ["demo under 90 seconds", files.demoScript.includes("1:18–1:30")],
  ["unknown fail closed", files.security.includes("There is no UNKNOWN -> TRUE coercion")],
  ["known revocation gap", files.security.includes("Known hardening gap")],
  ["t4 status pass", files.t4.includes("Status: **PASS")],
  ["readme t4 pass", files.readme.includes("AAPLx -> AAPLon representation migration") && files.readme.includes("35733746142")],
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
