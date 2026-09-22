import { readFile } from "node:fs/promises";
import { evaluateTransition } from "../src/policy/evaluator.mjs";
import { planRepresentationRepair } from "../src/runtime/repair-planner.mjs";

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

const repairPlan = planRepresentationRepair({
  currentClaimId: "treasury:openeden:tbill",
  evaluations: rows.map((row) => ({
    claimId: row.claimId,
    decision: row.decision,
    ruleResults: row.failures.map((failure) => ({
      outcome: "REFUSE",
      reasonCode: failure.reasonCode,
    })),
  })),
  authority: { allowedOperators: ["MIGRATE", "FREEZE"] },
  candidatePriority: ["treasury:superstate:ustb"],
});

if (
  repairPlan.outcome !== "MIGRATE" ||
  repairPlan.toClaimId !== "treasury:superstate:ustb" ||
  repairPlan.executable !== false
) {
  throw new Error("Treasury repair planner did not preserve the proof boundary");
}

console.log(JSON.stringify({
  schemaVersion: "covenant.treasury-portability-demo.v1",
  covenantId: covenant.id,
  underlyingIntent: covenant.underlyingIntent,
  coreEvaluator: "src/policy/evaluator.mjs",
  result: rows,
  repairPlan,
  assertion: "The same COVENANT evaluator and repair planner distinguish three real Treasury/cash-equivalent representations and can propose—but not execute—a TBILL -> USTB repair without Apple-specific core changes.",
}, null, 2));
