import { readFile } from "node:fs/promises";
import { evaluateTransition } from "../src/policy/evaluator.mjs";

const load = async (path) => JSON.parse(await readFile(path, "utf8"));
const covenant = await load("fixtures/treasury-us-qualified-same-day.json");
const claims = [
  await load("fixtures/passports/treasury-ustb.json"),
  await load("fixtures/passports/treasury-tbill.json"),
  await load("fixtures/passports/treasury-usdy.json"),
];

const rows = claims.map((passport) => {
  const evaluation = evaluateTransition({
    covenant,
    passport,
    market: {},
    portfolioPostState: {},
    authority: {
      allowedOperators: ["ACQUIRE", "MIGRATE", "FREEZE", "EXIT"],
      maxAutonomousTransitionUsd: 1_000_000,
    },
    proposal: {
      positionId: "position:treasury:portability:01",
      operator: "ACQUIRE",
      amountUsd: 100_000,
    },
    now: new Date("2026-09-22T17:08:00.000Z"),
  });
  return {
    claimId: passport.id,
    provider: passport.provider,
    decision: evaluation.decision,
    failures: evaluation.ruleResults
      .filter((r) => r.outcome !== "ALLOW")
      .map((r) => ({ ruleId: r.ruleId, reasonCode: r.reasonCode, actual: r.actual, expected: r.expected })),
  };
});

const expected = {
  "treasury:superstate:ustb": "ALLOW",
  "treasury:openeden:tbill": "REFUSE",
  "treasury:ondo:usdy": "REFUSE",
};
for (const row of rows) {
  if (row.decision !== expected[row.claimId]) {
    throw new Error("Unexpected portability result for " + row.claimId + ": " + row.decision);
  }
}

console.log(JSON.stringify({
  schemaVersion: "covenant.treasury-portability-demo.v1",
  covenantId: covenant.id,
  underlyingIntent: covenant.underlyingIntent,
  coreEvaluator: "src/policy/evaluator.mjs",
  result: rows,
  assertion: "The same COVENANT evaluator distinguishes three real Treasury/cash-equivalent representations from authoritative semantic evidence; no Apple-specific evaluator changes are required.",
}, null, 2));
