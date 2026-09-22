import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareEconomicTransition,
  proposeEconomicTransition,
  proveEconomicTransition,
  RuntimeStage,
} from "../src/runtime/covenant-runtime.mjs";

const observedAt = "2026-09-22T07:19:30.869Z";

function evidence(value, evidenceClass, source = "fixture") {
  return {
    value,
    status: "VERIFIED",
    evidenceClass,
    observedAt,
    source,
    payloadHash: "11".repeat(32),
  };
}

const covenant = {
  id: "covenant:test",
  version: 1,
  rules: [
    {
      id: "claim.verified",
      evidencePath: "passport.properties.verified",
      operator: "EQUALS",
      expected: true,
      hard: true,
      minEvidenceClass: "SIGNED_OR_AUTHORITATIVE_OFFCHAIN",
      onUnknown: "REFUSE",
      reasonCode: "CLAIM_NOT_VERIFIED",
    },
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
  id: "claim:a",
  version: 1,
  mint: "Claim111",
  properties: {
    verified: evidence(
      true,
      "SIGNED_OR_AUTHORITATIVE_OFFCHAIN",
      "issuer",
    ),
  },
};

const authority = {
  allowedOperators: ["ACQUIRE"],
  maxAutonomousTransitionUsd: 100,
};

const proposal = {
  positionId: "position:test",
  operator: "ACQUIRE",
  amountUsd: 100,
};

function evaluationInput(priceImpactBps) {
  return {
    covenant,
    passport,
    market: {
      priceImpactBps: evidence(
        priceImpactBps,
        "LIVE_MARKET_OR_ORACLE",
        "jupiter",
      ),
    },
    portfolioPostState: {},
    authority,
    proposal,
    now: observedAt,
  };
}

function proofInput() {
  return {
    evidenceRecords: [
      passport.properties.verified,
      evaluationInput(10).market.priceImpactBps,
    ],
    preState: {
      positionVersion: 0,
      currentClaimMint: null,
    },
    proposedPostState: {
      positionVersion: 1,
      currentClaimMint: "Claim111",
    },
    authorityRef: {
      kind: "COVENANT_POSITION_PDA",
      allowedOperators: ["ACQUIRE"],
      maxAutonomousTransitionUsd: 100,
    },
    executionCommitment: {
      kind: "EXACT_SWAP",
      inputMint: "USDC",
      outputMint: "Claim111",
      inputAmount: "100000000",
      minOut: "1",
    },
    nonce: 0,
    expiresAt: "2026-09-22T07:19:50.869Z",
  };
}

test("ALLOW remains non-executable until exact proof material is bound", () => {
  const result = prepareEconomicTransition({
    evaluationInput: evaluationInput(10),
  });

  assert.equal(result.proposal.decision, "ALLOW");
  assert.equal(result.proposal.stage, RuntimeStage.PROPOSED);
  assert.equal(result.executable, false);
  assert.equal(result.proof, null);
});

test("ALLOW plus exact execution commitment creates executable proof", () => {
  const result = prepareEconomicTransition({
    evaluationInput: evaluationInput(10),
    proofInput: proofInput(),
  });

  assert.equal(result.proposal.decision, "ALLOW");
  assert.equal(result.executable, true);
  assert.equal(result.proofPacket.stage, RuntimeStage.PROVEN);
  assert.match(result.proof.proofHash, /^[0-9a-f]{64}$/);
  assert.match(result.proof.executionCommitmentHash, /^[0-9a-f]{64}$/);
});

test("REFUSE can never be converted into executable proof", () => {
  const proposalResult = proposeEconomicTransition(evaluationInput(471));

  assert.equal(proposalResult.packet.decision, "REFUSE");
  assert.equal(proposalResult.packet.stage, RuntimeStage.REFUSED);
  assert.equal(proposalResult.packet.executable, false);

  assert.throws(
    () =>
      proveEconomicTransition({
        proposalResult,
        covenant,
        passport,
        ...proofInput(),
      }),
    /Only an ALLOW proposal/,
  );
});

test("UNKNOWN required evidence stays fail-closed", () => {
  const unknownPassport = {
    ...passport,
    properties: {
      verified: {
        value: null,
        status: "UNKNOWN",
        evidenceClass: "UNKNOWN",
        observedAt: null,
        source: "missing",
      },
    },
  };

  const result = proposeEconomicTransition({
    ...evaluationInput(10),
    passport: unknownPassport,
  });

  assert.equal(result.packet.decision, "REFUSE");
  assert.equal(
    result.packet.ruleResults.find((rule) => rule.ruleId === "claim.verified")
      .reasonCode,
    "EVIDENCE_UNKNOWN",
  );
});
