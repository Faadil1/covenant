import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateTransition, Decision } from "../src/policy/evaluator.mjs";
import { buildApplePythMarket, trackingErrorBps } from "../src/market/pyth-apple.mjs";

const load = async (path) => JSON.parse(await readFile(path, "utf8"));
const covenant = await load("fixtures/apple-pyth-mainnet-canary-covenant.json");
const passport = await load("fixtures/passports/apple-aaplx.json");

function input(market, now = new Date("2026-09-22T19:30:10.000Z")) {
  return {
    covenant,
    passport,
    market,
    portfolioPostState: {},
    authority: {
      allowedOperators: ["ACQUIRE"],
      maxAutonomousTransitionUsd: 10,
    },
    proposal: {
      positionId: "position:apple:mainnet-canary:01",
      operator: "ACQUIRE",
      amountUsd: 5,
    },
    now,
  };
}

test("Pyth Apple adapter computes absolute tracking error in basis points", () => {
  assert.equal(trackingErrorBps(200, 199), 50);
  assert.equal(trackingErrorBps(200, 201), 50);
});

test("Pyth-backed Apple canary ALLOWs a fresh tightly-tracking representation", () => {
  const market = buildApplePythMarket({
    reference: { price: 250, confidence: 0.05, timestampUs: 1790105400000000 },
    representation: { price: 249.5, confidence: 0.08, timestampUs: 1790105400000000 },
    representationSymbol: "AAPLx",
  });
  const result = evaluateTransition(input(market));
  assert.equal(result.decision, Decision.ALLOW);
  assert.ok(result.ruleResults.every((row) => row.outcome === Decision.ALLOW));
});

test("Pyth-backed Apple canary REFUSEs excessive tracking error", () => {
  const market = buildApplePythMarket({
    reference: { price: 250, confidence: 0.05, timestampUs: 1790105400000000 },
    representation: { price: 247.5, confidence: 0.08, timestampUs: 1790105400000000 },
    representationSymbol: "AAPLx",
  });
  const result = evaluateTransition(input(market));
  assert.equal(result.decision, Decision.REFUSE);
  const rule = result.ruleResults.find((row) => row.ruleId === "market.max_tracking_error_bps");
  assert.equal(rule.reasonCode, "TRACKING_ERROR_EXCEEDED");
  assert.ok(rule.actual > 75);
});

test("Pyth-backed Apple canary fails closed when evidence is stale", () => {
  const market = buildApplePythMarket({
    reference: { price: 250, confidence: 0.05, timestampUs: 1790105400000000 },
    representation: { price: 249.5, confidence: 0.08, timestampUs: 1790105400000000 },
    representationSymbol: "AAPLx",
  });
  const result = evaluateTransition(input(market, new Date("2026-09-22T19:31:00.000Z")));
  assert.equal(result.decision, Decision.REFUSE);
  assert.ok(result.ruleResults.some((row) => row.reasonCode === "EVIDENCE_STALE"));
});

test("Pyth-backed Apple canary REFUSEs wide oracle confidence", () => {
  const market = buildApplePythMarket({
    reference: { price: 250, confidence: 1, timestampUs: 1790105400000000 },
    representation: { price: 249.5, confidence: 1, timestampUs: 1790105400000000 },
    representationSymbol: "AAPLx",
  });
  const result = evaluateTransition(input(market));
  assert.equal(result.decision, Decision.REFUSE);
  const rule = result.ruleResults.find((row) => row.ruleId === "market.max_confidence_bps");
  assert.equal(rule.reasonCode, "ORACLE_CONFIDENCE_TOO_WIDE");
});

test("Mainnet canary cannot exceed the explicit autonomous cap", () => {
  const market = buildApplePythMarket({
    reference: { price: 250, confidence: 0.05, timestampUs: 1790105400000000 },
    representation: { price: 249.5, confidence: 0.08, timestampUs: 1790105400000000 },
    representationSymbol: "AAPLx",
  });
  const result = evaluateTransition({
    ...input(market),
    proposal: {
      positionId: "position:apple:mainnet-canary:01",
      operator: "ACQUIRE",
      amountUsd: 11,
    },
  });
  assert.equal(result.decision, Decision.ESCALATE);
  assert.equal(
    result.ruleResults.find((row) => row.ruleId === "authority.autonomous_cap").reasonCode,
    "AUTONOMOUS_CAP_EXCEEDED",
  );
});
