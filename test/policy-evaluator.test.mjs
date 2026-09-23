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
      priceImpactBps: verified(20, "LIVE_MARKET_OR_ORACLE"),
      basisBps: verified(15, "LIVE_MARKET_OR_ORACLE"),
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

test("REFUSE: active permanent delegate violates the strict owner-control rule", () => {
  const proof = evaluateTransition(baseInput(aaplx));
  assert.equal(proof.decision, Decision.REFUSE);
  const result = proof.ruleResults.find(
    (r) => r.ruleId === "claim.permanent_delegate_active",
  );
  assert.equal(result.actual, true);
  assert.equal(result.expected, false);
  assert.equal(result.reasonCode, "PERMANENT_DELEGATE_NOT_ALLOWED");
});

test("REFUSE: unknown permanent-delegate state cannot silently pass", () => {
  const unknown = structuredClone(aaplx);
  unknown.properties.permanentDelegateActive = {
    value: null,
    status: "UNKNOWN",
    evidenceClass: "UNKNOWN",
    observedAt: null,
    source: "synthetic unknown test fixture"
  };
  const proof = evaluateTransition(baseInput(unknown));
  assert.equal(proof.decision, Decision.REFUSE);
  const result = proof.ruleResults.find(
    (r) => r.ruleId === "claim.permanent_delegate_active",
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

test("REFUSE: stale market quote evidence fails closed", () => {
  const input = baseInput();
  input.market.priceImpactBps.observedAt = "2026-09-22T04:59:00.000Z";
  const proof = evaluateTransition(input);
  assert.equal(proof.decision, Decision.REFUSE);
  assert.equal(
    proof.ruleResults.find((r) => r.ruleId === "market.max_price_impact_bps").reasonCode,
    "EVIDENCE_STALE",
  );
});

test("REFUSE: price impact and reference basis are distinct hard invariants", () => {
  const input = baseInput();
  input.market.priceImpactBps = verified(102.4, "LIVE_MARKET_OR_ORACLE");
  input.market.basisBps = verified(20, "LIVE_MARKET_OR_ORACLE");
  const proof = evaluateTransition(input);
  assert.equal(proof.decision, Decision.REFUSE);
  assert.equal(
    proof.ruleResults.find((r) => r.ruleId === "market.max_price_impact_bps").reasonCode,
    "PRICE_IMPACT_EXCEEDED",
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


test("REFUSE: verified user ineligibility is a first-class hard gate", () => {
  const input = baseInput();
  input.covenant = {
    ...covenant,
    rules: [
      ...covenant.rules,
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
  input.eligibility = {
    userCanAcquire: verified(false, "SIGNED_OR_AUTHORITATIVE_OFFCHAIN")
  };

  const proof = evaluateTransition(input);
  assert.equal(proof.decision, Decision.REFUSE);
  assert.equal(
    proof.ruleResults.find((r) => r.ruleId === "eligibility.user_can_acquire").reasonCode,
    "USER_INELIGIBLE_FOR_REPRESENTATION",
  );
});

test("REFUSE: unknown user eligibility cannot silently pass", () => {
  const input = baseInput();
  input.covenant = {
    ...covenant,
    rules: [
      ...covenant.rules,
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
  input.eligibility = {
    userCanAcquire: {
      value: null,
      status: "UNKNOWN",
      evidenceClass: "UNKNOWN",
      observedAt: null
    }
  };

  const proof = evaluateTransition(input);
  assert.equal(proof.decision, Decision.REFUSE);
  assert.equal(
    proof.ruleResults.find((r) => r.ruleId === "eligibility.user_can_acquire").reasonCode,
    "EVIDENCE_UNKNOWN",
  );
});
