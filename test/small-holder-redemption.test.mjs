import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Decision, evaluateTransition } from "../src/policy/evaluator.mjs";

const load = async (path) => JSON.parse(await readFile(path, "utf8"));
const covenant = await load("fixtures/apple-small-holder-covenant.json");
const aaplx = await load("fixtures/passports/apple-aaplx.json");
const aaplon = await load("fixtures/passports/apple-aaplon.json");

const NOW = new Date("2026-09-23T17:35:20.000Z");

function verified(value, evidenceClass, observedAt = "2026-09-23T17:35:10.000Z") {
  return { value, status: "VERIFIED", evidenceClass, observedAt };
}

function input(passport) {
  return {
    covenant,
    passport,
    market: {
      priceImpactBps: verified(20, "LIVE_MARKET_OR_ORACLE")
    },
    portfolioPostState: {},
    authority: {
      allowedOperators: ["ACQUIRE", "MIGRATE"],
      maxAutonomousTransitionUsd: 100
    },
    proposal: {
      positionId: "position:apple:small-holder",
      operator: "MIGRATE",
      amountUsd: 25
    },
    now: NOW
  };
}

test("AAPLx fails a user rule requiring direct issuer redemption at $100 or less", () => {
  const proof = evaluateTransition(input(aaplx));
  assert.equal(proof.decision, Decision.REFUSE);
  const result = proof.ruleResults.find(
    (row) => row.ruleId === "claim.direct_issuer_redemption_minimum_usd"
  );
  assert.equal(result.actual, 5000);
  assert.equal(result.expected, 100);
  assert.equal(result.reasonCode, "DIRECT_REDEMPTION_MINIMUM_TOO_HIGH");
});

test("AAPLon passes the same small-holder redemption rule on bound issuer evidence", () => {
  const proof = evaluateTransition(input(aaplon));
  assert.equal(proof.decision, Decision.ALLOW);
  const result = proof.ruleResults.find(
    (row) => row.ruleId === "claim.direct_issuer_redemption_minimum_usd"
  );
  assert.equal(result.actual, 1);
  assert.equal(result.expected, 100);
  assert.equal(result.outcome, Decision.ALLOW);
});
