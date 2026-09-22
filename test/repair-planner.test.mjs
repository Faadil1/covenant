import test from "node:test";
import assert from "node:assert/strict";
import {
  planRepresentationRepair,
  RepairOutcome,
} from "../src/runtime/repair-planner.mjs";

const allow = (claimId) => ({
  claimId,
  decision: "ALLOW",
  ruleResults: [],
});

const refuse = (claimId, reasonCode = "EVIDENCE_STALE") => ({
  claimId,
  decision: "REFUSE",
  ruleResults: [
    {
      ruleId: "market.freshness",
      outcome: "REFUSE",
      reasonCode,
    },
  ],
});

test("stays when current representation is still in Covenant", () => {
  const plan = planRepresentationRepair({
    currentClaimId: "aaplx",
    evaluations: [allow("aaplx"), refuse("aaplon")],
    authority: { allowedOperators: ["MIGRATE", "FREEZE"] },
  });

  assert.equal(plan.outcome, RepairOutcome.STAY);
  assert.equal(plan.executable, false);
});

test("proposes migration when one alternate qualifies and MIGRATE is delegated", () => {
  const plan = planRepresentationRepair({
    currentClaimId: "aaplx",
    evaluations: [refuse("aaplx"), allow("aaplon")],
    authority: { allowedOperators: ["MIGRATE", "FREEZE"] },
  });

  assert.equal(plan.outcome, RepairOutcome.MIGRATE);
  assert.equal(plan.fromClaimId, "aaplx");
  assert.equal(plan.toClaimId, "aaplon");
  assert.equal(plan.requiresFreshTransitionProof, true);
  assert.equal(plan.executable, false);
});

test("freezes instead of migrating when migration authority is not delegated", () => {
  const plan = planRepresentationRepair({
    currentClaimId: "aaplx",
    evaluations: [refuse("aaplx"), allow("aaplon")],
    authority: { allowedOperators: ["FREEZE"] },
  });

  assert.equal(plan.outcome, RepairOutcome.FREEZE);
  assert.equal(plan.reasonCode, "MIGRATION_NOT_DELEGATED");
});

test("does not silently choose between multiple qualifying alternates", () => {
  const plan = planRepresentationRepair({
    currentClaimId: "aaplx",
    evaluations: [
      refuse("aaplx"),
      allow("aaplon"),
      allow("apple-third"),
    ],
    authority: { allowedOperators: ["MIGRATE"] },
  });

  assert.equal(plan.outcome, RepairOutcome.ESCALATE);
  assert.equal(plan.reasonCode, "AMBIGUOUS_REPAIR_CANDIDATE");
});

test("owner-defined priority resolves multiple qualifying alternates deterministically", () => {
  const plan = planRepresentationRepair({
    currentClaimId: "aaplx",
    evaluations: [
      refuse("aaplx"),
      allow("aaplon"),
      allow("apple-third"),
    ],
    authority: { allowedOperators: ["MIGRATE"] },
    candidatePriority: ["apple-third", "aaplon"],
  });

  assert.equal(plan.outcome, RepairOutcome.MIGRATE);
  assert.equal(plan.toClaimId, "apple-third");
});

test("freezes when no alternate qualifies and FREEZE is delegated", () => {
  const plan = planRepresentationRepair({
    currentClaimId: "aaplx",
    evaluations: [refuse("aaplx"), refuse("aaplon", "PRICE_IMPACT_EXCEEDED")],
    authority: { allowedOperators: ["MIGRATE", "FREEZE"] },
  });

  assert.equal(plan.outcome, RepairOutcome.FREEZE);
  assert.equal(plan.reasonCode, "NO_QUALIFYING_ALTERNATE_CLAIM");
});
