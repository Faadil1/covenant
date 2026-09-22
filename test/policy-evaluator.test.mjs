import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Decision, evaluateTransition } from "../src/policy/evaluator.mjs";

const load = async (path) => JSON.parse(await readFile(path, "utf8"));
const covenant = await load("fixtures/apple-covenant.json");
const aaplon = await load("fixtures/passports/apple-aaplon.json");
const aaplx = await load("fixtures/passports/apple-aaplx.json");

const NOW = new Date("2026-09-22T05:00:20.000Z");

function verified(value, evidenceClass, observedAt = "2026-09-22T05:00:10.000Z") {
  return { value, status: "VERIFIED", evidenceClass, observedAt };
}

function baseInput(passport = aaplon, amountUsd = 100) {
  return {
    covenant,
    passport,
    market: {
      slippageBps: verified(20, "LIVE_MARKET_OR_ORACLE"),
    },
    portfolioPostState: {
      concentrationPct: verified(10, "ONCHAIN_DETERMINISTIC"),
    },
    authority: {
      allowedOperators: ["ACQUIRE", "MIGRATE", "SELL", "FREEZE"],
      maxAutonomousTransitionUsd: 100,
    },
    proposal: {
      positionId: "position:apple:42",
      operator: "ACQUIRE",
      amountUsd,
    },
    now: NOW,
  };
}

test("ALLOW: exact claim passes hard claim, market, portfolio and authority rules", () => {
  const proof = evaluateTransition(baseInput());
  assert.equal(proof.decision, Decision.ALLOW);
  assert.ok(proof.ruleResults.every((r) => r.outcome === Decision.ALLOW));
});

test("REFUSE: UNKNOWN authoritative claim property cannot silently pass", () => {
  const proof = evaluateTransition(baseInput(aaplx));
  assert.equal(proof.decision, Decision.REFUSE);
  const result = proof.ruleResults.find(
    (r) => r.ruleId === "claim.collateral_lending_requires_holder_opt_in",
  );
  assert.equal(result.reasonCode, "EVIDENCE_UNKNOWN");
});

test("ESCALATE: valid transition above autonomous cap needs owner authority", () => {
  const proof = evaluateTransition(baseInput(aaplon, 500));
  assert.equal(proof.decision, Decision.ESCALATE);
  assert.equal(
    proof.ruleResults.find((r) => r.ruleId === "authority.autonomous_cap").reasonCode,
    "AUTONOMOUS_CAP_EXCEEDED",
  );
});

test("REFUSE: stale live quote fails closed", () => {
  const input = baseInput();
  input.market.slippageBps.observedAt = "2026-09-22T04:59:00.000Z";
  const proof = evaluateTransition(input);
  assert.equal(proof.decision, Decision.REFUSE);
  assert.equal(
    proof.ruleResults.find((r) => r.ruleId === "market.max_slippage_bps").reasonCode,
    "EVIDENCE_STALE",
  );
});

test("REFUSE: agent cannot propose an operator outside delegated authority", () => {
  const input = baseInput();
  input.proposal.operator = "DECOMPOSE";
  const proof = evaluateTransition(input);
  assert.equal(proof.decision, Decision.REFUSE);
  assert.equal(
    proof.ruleResults.find((r) => r.ruleId === "authority.operator").reasonCode,
    "AUTHORITY_OPERATOR_NOT_ALLOWED",
  );
});
