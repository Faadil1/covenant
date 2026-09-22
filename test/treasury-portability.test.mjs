import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Decision, evaluateTransition } from "../src/policy/evaluator.mjs";
import { buildTransitionProof, sha256Canonical } from "../src/proof/transition-proof.mjs";
import { planRepresentationRepair, RepairOutcome } from "../src/runtime/repair-planner.mjs";

const load = async (path) => JSON.parse(await readFile(path, "utf8"));
const covenant = await load("fixtures/treasury-us-qualified-same-day.json");
const ustb = await load("fixtures/passports/treasury-ustb.json");
const tbill = await load("fixtures/passports/treasury-tbill.json");
const usdy = await load("fixtures/passports/treasury-usdy.json");

function input(passport) {
  return {
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
  };
}

function evidenceRecords(passport) {
  return Object.values(passport.properties).map((record) => ({
    ...record,
    payloadHash: sha256Canonical({ value: record.value, source: record.source }),
  }));
}

test("Treasury portability: USTB ALLOWs under the same deterministic evaluator", () => {
  const result = evaluateTransition(input(ustb));
  assert.equal(result.decision, Decision.ALLOW);
  assert.ok(result.ruleResults.every((r) => r.outcome === Decision.ALLOW));
});

test("Treasury portability: TBILL REFUSEs because normal redemption exceeds same-day mandate", () => {
  const result = evaluateTransition(input(tbill));
  assert.equal(result.decision, Decision.REFUSE);
  const rule = result.ruleResults.find((r) => r.ruleId === "claim.max_normal_redemption_business_days");
  assert.equal(rule.reasonCode, "REDEMPTION_HORIZON_EXCEEDED");
  assert.equal(rule.actual, 1);
  assert.equal(rule.expected, 0);
});

test("Treasury portability: USDY REFUSEs a US-qualified primary-access mandate and exposure-only claim model", () => {
  const result = evaluateTransition(input(usdy));
  assert.equal(result.decision, Decision.REFUSE);
  assert.equal(
    result.ruleResults.find((r) => r.ruleId === "claim.us_primary_access_compatible").reasonCode,
    "US_PRIMARY_ACCESS_NOT_ALLOWED",
  );
  assert.equal(
    result.ruleResults.find((r) => r.ruleId === "claim.legal_claim_model").reasonCode,
    "LEGAL_CLAIM_MODEL_NOT_ALLOWED",
  );
});

test("Treasury portability: existing Transition Proof machinery accepts ALLOW and rejects REFUSE without core changes", () => {
  const allowEvaluation = evaluateTransition(input(ustb));
  const refuseEvaluation = evaluateTransition(input(tbill));

  const proof = buildTransitionProof({
    evaluation: allowEvaluation,
    covenant,
    passport: ustb,
    evidenceRecords: evidenceRecords(ustb),
    preState: {
      positionId: "position:treasury:portability:01",
      positionVersion: 0,
      nonce: 0,
      currentClaim: null,
    },
    proposedPostState: {
      positionId: "position:treasury:portability:01",
      positionVersion: 1,
      currentClaim: ustb.id,
    },
    authorityRef: {
      kind: "PORTABILITY_RESEARCH_AUTHORITY",
      allowedOperators: ["ACQUIRE", "MIGRATE", "FREEZE", "EXIT"],
      maxAutonomousTransitionUsd: 1_000_000,
    },
    executionCommitment: {
      kind: "NON_EXECUTING_PORTABILITY_FIXTURE",
      note: "Semantic portability test only",
    },
    nonce: 0,
    expiresAt: "2026-09-22T17:10:00.000Z",
  });

  assert.equal(proof.schemaVersion, "covenant.transition-proof-packet.v1");
  assert.equal(proof.positionId, "position:treasury:portability:01");
  assert.equal(proof.covenantVersion, 1);
  assert.ok(/^[0-9a-f]{64}$/.test(proof.proofHash));

  assert.throws(
    () => buildTransitionProof({ evaluation: refuseEvaluation }),
    /Only an ALLOW evaluation/,
  );
});

test("Treasury portability: an out-of-Covenant TBILL position produces a non-executable USTB repair proposal", () => {
  const current = evaluateTransition(input(tbill));
  const alternate = evaluateTransition(input(ustb));

  const repair = planRepresentationRepair({
    currentClaimId: tbill.id,
    evaluations: [
      { claimId: tbill.id, decision: current.decision, ruleResults: current.ruleResults },
      { claimId: ustb.id, decision: alternate.decision, ruleResults: alternate.ruleResults },
      { claimId: usdy.id, decision: evaluateTransition(input(usdy)).decision },
    ],
    authority: {
      allowedOperators: ["MIGRATE", "FREEZE"],
    },
    candidatePriority: [ustb.id],
  });

  assert.equal(repair.outcome, RepairOutcome.MIGRATE);
  assert.equal(repair.fromClaimId, tbill.id);
  assert.equal(repair.toClaimId, ustb.id);
  assert.equal(repair.executable, false);
  assert.equal(repair.requiresFreshEvidence, true);
  assert.equal(repair.requiresFreshTransitionProof, true);
  assert.ok(repair.sourceFailure.reasonCodes.includes("REDEMPTION_HORIZON_EXCEEDED"));
});
