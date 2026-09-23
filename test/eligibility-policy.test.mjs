import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Decision, evaluateTransition } from "../src/policy/evaluator.mjs";

const load = async (path) => JSON.parse(await readFile(path, "utf8"));
const aaplx = await load("fixtures/passports/apple-aaplx.json");
const aaplon = await load("fixtures/passports/apple-aaplon.json");
const caAaplx = await load("fixtures/eligibility/ca-qc-aaplx.json");
const caAaplon = await load("fixtures/eligibility/ca-qc-aaplon.json");

const covenant = {
  id: "covenant:eligibility:reality-gate",
  version: 1,
  rules: [
    {
      id: "eligibility.user_can_acquire",
      evidencePath: "eligibility.userCanAcquire",
      operator: "EQUALS",
      expected: true,
      hard: true,
      minEvidenceClass: "SIGNED_OR_AUTHORITATIVE_OFFCHAIN",
      onUnknown: "REFUSE",
      reasonCode: "USER_INELIGIBLE_FOR_REPRESENTATION"
    }
  ]
};

function input(passport, evidence) {
  return {
    covenant,
    passport,
    eligibility: evidence,
    market: {},
    portfolioPostState: {},
    authority: {
      allowedOperators: ["ACQUIRE"],
      maxAutonomousTransitionUsd: 100
    },
    proposal: {
      positionId: "position:apple:eligibility-demo",
      operator: "ACQUIRE",
      amountUsd: 25
    },
    now: new Date("2026-09-23T15:31:00.000Z")
  };
}

test("Canada/Quebec xStocks evidence refuses AAPLx acquisition", () => {
  const proof = evaluateTransition(
    input(aaplx, { userCanAcquire: caAaplx.userCanAcquire }),
  );
  assert.equal(proof.decision, Decision.REFUSE);
  const result = proof.ruleResults.find(
    (row) => row.ruleId === "eligibility.user_can_acquire",
  );
  assert.equal(result.actual, false);
  assert.equal(result.reasonCode, "USER_INELIGIBLE_FOR_REPRESENTATION");
});

test("Canada/Quebec Ondo eligibility evidence refuses AAPLon acquisition", () => {
  const proof = evaluateTransition(
    input(aaplon, { userCanAcquire: caAaplon.userCanAcquire }),
  );
  assert.equal(proof.decision, Decision.REFUSE);
  const result = proof.ruleResults.find(
    (row) => row.ruleId === "eligibility.user_can_acquire",
  );
  assert.equal(result.actual, false);
  assert.equal(result.reasonCode, "USER_INELIGIBLE_FOR_REPRESENTATION");
});

test("eligibility semantics allow evaluation to continue only with verified true evidence", () => {
  const syntheticEligible = {
    userCanAcquire: {
      value: true,
      status: "VERIFIED",
      evidenceClass: "SIGNED_OR_AUTHORITATIVE_OFFCHAIN",
      observedAt: "2026-09-23T15:30:00.000Z",
      source: "synthetic-test-only"
    }
  };
  const proof = evaluateTransition(input(aaplx, syntheticEligible));
  assert.equal(proof.decision, Decision.ALLOW);
});
