import test from "node:test";
import assert from "node:assert/strict";
import { revalidateInvariantPosition, PositionHealth } from "../src/runtime/revalidation.mjs";
import { verifyTransitionReceipt } from "../src/runtime/receipt-verifier.mjs";
import { buildTransitionProof, buildReceipt, sha256Canonical } from "../src/proof/transition-proof.mjs";

const observedAt = "2026-09-22T07:19:30.869Z";
const evidence = (value, evidenceClass, observed = observedAt) => ({
  value,
  status: "VERIFIED",
  evidenceClass,
  observedAt: observed,
  source: "fixture",
  payloadHash: sha256Canonical({ value, observed }),
});

const covenant = {
  id: "covenant:revalidation",
  version: 1,
  rules: [
    {
      id: "market.max_impact",
      evidencePath: "market.priceImpactBps",
      operator: "LTE",
      expected: 50,
      hard: true,
      minEvidenceClass: "LIVE_MARKET_OR_ORACLE",
      maxAgeSeconds: 30,
      onUnknown: "REFUSE",
      reasonCode: "PRICE_IMPACT_EXCEEDED",
    },
  ],
};

const passport = {
  id: "apple:xstocks:aaplx",
  version: 1,
  mint: "AAPLxMint",
  properties: {},
};

const authority = {
  allowedOperators: ["ACQUIRE", "MIGRATE", "FREEZE"],
  maxAutonomousTransitionUsd: 100,
};

const proposal = {
  positionId: "position:apple",
  operator: "ACQUIRE",
  amountUsd: 100,
};

test("same claim moves from IN_COVENANT to OUT_OF_COVENANT when evidence changes", () => {
  const first = revalidateInvariantPosition({
    currentClaimId: passport.id,
    currentPassport: passport,
    covenant,
    market: { priceImpactBps: evidence(20, "LIVE_MARKET_OR_ORACLE") },
    authority,
    proposal,
    previousHealth: PositionHealth.UNKNOWN,
    now: observedAt,
  });

  assert.equal(first.health, PositionHealth.IN_COVENANT);

  const second = revalidateInvariantPosition({
    currentClaimId: passport.id,
    currentPassport: passport,
    covenant,
    market: { priceImpactBps: evidence(80, "LIVE_MARKET_OR_ORACLE") },
    authority,
    proposal,
    previousHealth: first.health,
    alternateEvaluations: [
      { claimId: "apple:ondo:aaplon", decision: "ALLOW", ruleResults: [] },
    ],
    now: observedAt,
  });

  assert.equal(second.health, PositionHealth.OUT_OF_COVENANT);
  assert.equal(second.changed, true);
  assert.equal(second.decision, "REFUSE");
  assert.equal(second.repair.outcome, "MIGRATE");
  assert.equal(second.repair.toClaimId, "apple:ondo:aaplon");
  assert.equal(second.oldProofReusable, false);
});

test("stale evidence invalidates the current representation fail-closed", () => {
  const stale = revalidateInvariantPosition({
    currentClaimId: passport.id,
    currentPassport: passport,
    covenant,
    market: {
      priceImpactBps: evidence(
        20,
        "LIVE_MARKET_OR_ORACLE",
        "2026-09-22T07:18:00.000Z",
      ),
    },
    authority,
    proposal,
    previousHealth: PositionHealth.IN_COVENANT,
    now: observedAt,
  });

  assert.equal(stale.health, PositionHealth.OUT_OF_COVENANT);
  assert.equal(stale.decision, "REFUSE");
  assert.equal(
    stale.ruleResults.find((rule) => rule.ruleId === "market.max_impact")
      .reasonCode,
    "EVIDENCE_STALE",
  );
});

test("receipt verifier detects exact proof and settled-state integrity", () => {
  const evaluation = {
    decision: "ALLOW",
    positionId: "position:apple",
    operator: "ACQUIRE",
    claimId: passport.id,
    covenantVersion: 1,
    ruleResults: [],
  };

  const proof = buildTransitionProof({
    evaluation,
    covenant,
    passport,
    evidenceRecords: [evidence(20, "LIVE_MARKET_OR_ORACLE")],
    preState: { positionVersion: 0, nonce: 0, currentClaimMint: null },
    proposedPostState: { positionVersion: 1, nonce: 1, currentClaimMint: "AAPLxMint" },
    authorityRef: { kind: "COVENANT_POSITION_PDA" },
    executionCommitment: { kind: "EXACT_SWAP", input: "USDC", output: "AAPLxMint" },
    nonce: 0,
    expiresAt: "2026-09-22T07:20:00.000Z",
  });

  const settledState = {
    positionVersion: 1,
    nonce: 1,
    currentClaimMint: "AAPLxMint",
    inputSpentRaw: "100000000",
    outputReceivedRaw: "29334103",
  };

  const receipt = buildReceipt({
    proof,
    settledState,
    transactionReference: {
      environment: "SURFPOOL_MAINNET_SHAPED_FORK",
      signature: "fork-signature",
    },
    outcome: "EXECUTED",
    observedAt: "2026-09-22T07:19:31.545Z",
  });

  const verified = verifyTransitionReceipt({
    proof,
    receipt,
    settledState,
    expectedTransactionReference: {
      environment: "SURFPOOL_MAINNET_SHAPED_FORK",
      signature: "fork-signature",
    },
  });

  assert.equal(verified.valid, true);
  assert.equal(verified.reasonCode, "RECEIPT_VALID");

  const tampered = verifyTransitionReceipt({
    proof,
    receipt,
    settledState: { ...settledState, outputReceivedRaw: "1" },
  });

  assert.equal(tampered.valid, false);
  assert.equal(tampered.reasonCode, "SETTLED_STATE_HASH_MISMATCH");
});
