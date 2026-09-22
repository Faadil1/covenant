import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateTransition, Decision } from "../src/policy/evaluator.mjs";
import { buildTeslaPythJupiterMarketEvidence } from "../src/evidence/tsla-pyth-jupiter.mjs";

const covenant = JSON.parse(
  await readFile("fixtures/tesla-mainnet-canary-covenant.json", "utf8"),
);
const passport = JSON.parse(
  await readFile("fixtures/passports/tesla-tslax.json", "utf8"),
);

function evidence({ price = 378.63462, confidenceBps = 2.23, publishers = 11 } = {}) {
  return {
    feeds: [{
      symbol: "Equity.US.TSLA/USD",
      price,
      confidenceBps,
      publisherCount: publishers,
      observedAt: "2026-09-22T22:46:22.400Z",
    }],
    signedPayload: {
      sha256: "a".repeat(64),
      byteLength: 158,
    },
  };
}

function market({ outAmount = "1320514", priceImpactPct = "0" } = {}) {
  return buildTeslaPythJupiterMarketEvidence({
    pythEvidence: evidence(),
    quote: {
      outAmount,
      priceImpactPct,
      observedAt: "2026-09-22T22:46:22.700Z",
      source: "Jupiter fixture",
      routeLabels: ["BinaryFi"],
    },
    inputUsd: 5,
    tslaxDecimals: 8,
  });
}

function evaluate(m, now = new Date("2026-09-22T22:46:23.000Z")) {
  return evaluateTransition({
    covenant,
    passport,
    market: m,
    portfolioPostState: {},
    authority: {
      allowedOperators: ["ACQUIRE"],
      maxAutonomousTransitionUsd: 20,
    },
    proposal: {
      positionId: "position:tesla:stocklana-canary",
      operator: "ACQUIRE",
      amountUsd: 5,
    },
    now,
  });
}

test("live-like TSLA/Pyth + TSLAx/Jupiter evidence ALLOWs", () => {
  const m = market();
  assert.ok(m.trackingErrorBps.value < 1);
  assert.equal(evaluate(m).decision, Decision.ALLOW);
});

test("executable TSLAx price drifting >75 bps REFUSEs", () => {
  const m = market({ outAmount: "1300000" });
  const result = evaluate(m);
  assert.equal(result.decision, Decision.REFUSE);
  assert.equal(
    result.ruleResults.find((x) => x.ruleId === "market.pyth_execution_tracking_error_bps").reasonCode,
    "PYTH_EXECUTION_TRACKING_ERROR_EXCEEDED",
  );
});

test("stale Pyth/Jupiter evidence fails closed", () => {
  const result = evaluate(market(), new Date("2026-09-22T22:47:00.000Z"));
  assert.equal(result.decision, Decision.REFUSE);
  assert.ok(result.ruleResults.some((x) => x.reasonCode === "EVIDENCE_STALE"));
});

test("wide Pyth confidence fails closed", () => {
  const m = buildTeslaPythJupiterMarketEvidence({
    pythEvidence: evidence({ confidenceBps: 75 }),
    quote: {
      outAmount: "1320514",
      priceImpactPct: "0",
      observedAt: "2026-09-22T22:46:22.700Z",
      source: "Jupiter fixture",
    },
    inputUsd: 5,
    tslaxDecimals: 8,
  });
  assert.equal(evaluate(m).decision, Decision.REFUSE);
});

test("route impact above 50 bps fails closed", () => {
  const m = market({ priceImpactPct: "0.006" });
  assert.equal(evaluate(m).decision, Decision.REFUSE);
});
