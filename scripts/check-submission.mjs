import { readFile } from "node:fs/promises";

const files = {
  readme: await readFile(new URL("../README.md", import.meta.url), "utf8"),
  submission: await readFile(new URL("../docs/SUBMISSION-PACK.md", import.meta.url), "utf8"),
  demoScript: await readFile(new URL("../docs/DEMO-SCRIPT-90S.md", import.meta.url), "utf8"),
  security: await readFile(new URL("../SECURITY.md", import.meta.url), "utf8"),
  t4: await readFile(new URL("../docs/T4-SELF-HEALING.md", import.meta.url), "utf8"),
};

const checks = [
  ["user-app thesis", files.submission.includes("COVENANT protects a user's tokenized-stock position")],
  ["single Apple wedge", files.submission.includes("protected Apple position") && files.submission.includes("AAPLx or AAPLon")],
  ["human decision language", files.submission.includes("PROTECTED / BLOCKED / REVIEW NEEDED")],
  ["wallet-policy differentiation", files.readme.includes("A wallet policy asks whether an actor may sign")],
  ["solana authority boundary", files.submission.includes("Solana authority boundary")],
  ["pyth does real work", files.submission.includes("Pyth market data is an authorization input")],
  ["t3 canonical run", files.submission.includes("35698743841")],
  ["t4 canonical run", files.submission.includes("35733746142")],
  ["t4 artifact", files.submission.includes("10696822718")],
  ["objective Apple control difference", files.submission.includes("PermanentDelegate") && files.submission.includes("35884969091")],
  ["objective issuer-term difference", files.submission.includes("$5,000") && files.submission.includes("$1") && files.submission.includes("small-holder")],
  ["judge demo uses objective control rule", files.demoScript.includes("PermanentDelegate") && files.demoScript.includes("AAPLx") && files.demoScript.includes("AAPLon")],
  ["fork truth boundary", files.submission.includes("Surfpool mainnet-shaped fork") && files.submission.includes("full mainnet COVENANT execution: not claimed")],
  ["demo under 90 seconds", files.demoScript.includes("1:18–1:30")],
  ["demo starts with user", files.demoScript.toLowerCase().includes("protect my apple position")],
  ["unknown fail closed", files.security.includes("There is no UNKNOWN -> TRUE coercion")],
  ["known revocation gap", files.security.includes("Known hardening gap")],
  ["t4 status pass", files.t4.includes("Status: **PASS")],
  ["readme t4 evidence", files.readme.includes("AAPLx -> AAPLon representation switch") && files.readme.includes("35733746142")],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  throw new Error("Submission readiness failed: " + failed.map(([name]) => name).join(", "));
}

console.log(JSON.stringify({
  schemaVersion: "covenant.submission-readiness.v2",
  status: "PASS",
  checks: checks.map(([name]) => name),
}, null, 2));
