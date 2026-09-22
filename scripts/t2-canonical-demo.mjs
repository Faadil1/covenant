import { readFile } from "node:fs/promises";
import { evaluateTransition, Decision } from "../src/policy/evaluator.mjs";
import {
  buildEvidenceRoot,
  buildTransitionProof,
  sha256Canonical,
} from "../src/proof/transition-proof.mjs";

const loadJson = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

function record(value, {
  evidenceClass,
  observedAt,
  source,
  status = "VERIFIED",
}) {
  return {
    value,
    evidenceClass,
    observedAt,
    source,
    status,
    payloadHash: sha256Canonical({ value, source }),
  };
}

async function evaluateClaim({ covenant, passport, observedAt }) {
  const market = {
    priceImpactBps: record(5, {
      evidenceClass: "LIVE_MARKET_OR_ORACLE",
      observedAt,
      source: "demo:live-market-fixture",
    }),
    basisBps: record(10, {
      evidenceClass: "LIVE_MARKET_OR_ORACLE",
      observedAt,
      source: "demo:reference-basis-fixture",
    }),
  };

  const portfolioPostState = {
    concentrationPct: record(10, {
      evidenceClass: "ONCHAIN_DETERMINISTIC",
      observedAt,
      source: "demo:simulated-post-state",
    }),
  };

  const authority = {
    allowedOperators: ["ACQUIRE"],
    maxAutonomousTransitionUsd: 100,
  };

  const proposal = {
    positionId: "position:apple:42",
    operator: "ACQUIRE",
    amountUsd: 75,
  };

  const evaluation = evaluateTransition({
    covenant,
    passport,
    market,
    portfolioPostState,
    authority,
    proposal,
    now: observedAt,
  });

  return { evaluation, market, portfolioPostState, authority, proposal };
}

async function main() {
  const [covenant, aaplon, aaplx] = await Promise.all([
    loadJson("../fixtures/apple-covenant.json"),
    loadJson("../fixtures/passports/apple-aaplon.json"),
    loadJson("../fixtures/passports/apple-aaplx.json"),
  ]);

  const observedAt = new Date().toISOString();

  // Refresh only the timestamp of already-authoritative fixture evidence.
  // The source/value/evidence class are unchanged.
  aaplon.properties.collateralLendingRequiresHolderOptIn.observedAt = observedAt;

  const allowCase = await evaluateClaim({
    covenant,
    passport: aaplon,
    observedAt,
  });

  const refuseCase = await evaluateClaim({
    covenant,
    passport: aaplx,
    observedAt,
  });

  if (allowCase.evaluation.decision !== Decision.ALLOW) {
    throw new Error("Canonical AAPLon case must ALLOW");
  }
  if (refuseCase.evaluation.decision !== Decision.REFUSE) {
    throw new Error("Canonical AAPLx UNKNOWN evidence case must REFUSE");
  }

  const evidenceRecords = [
    aaplon.properties.collateralLendingRequiresHolderOptIn,
    allowCase.market.priceImpactBps,
    allowCase.market.basisBps,
    allowCase.portfolioPostState.concentrationPct,
  ];

  const preState = {
    positionId: "position:apple:42",
    positionVersion: 7,
    currentClaimId: null,
    targetExposureUsd: 500,
  };

  const proposedPostState = {
    positionId: "position:apple:42",
    positionVersion: 8,
    currentClaimId: aaplon.id,
    acquiredExposureUsd: allowCase.proposal.amountUsd,
    targetExposureUsd: 500,
  };

  const proof = buildTransitionProof({
    evaluation: allowCase.evaluation,
    covenant,
    passport: aaplon,
    evidenceRecords,
    preState,
    proposedPostState,
    authorityRef: {
      kind: "COVENANT_POSITION_PDA",
      allowedOperators: allowCase.authority.allowedOperators,
      maxAutonomousTransitionUsd: allowCase.authority.maxAutonomousTransitionUsd,
    },
    executionCommitment: {
      stage: "T2_ONLY",
      exactOutputMint: aaplon.mint,
      note: "T3b binds this field to a Jupiter V2 invocation commitment.",
    },
    nonce: 11,
    expiresAt: new Date(Date.parse(observedAt) + 20_000).toISOString(),
  });

  const report = {
    schemaVersion: "covenant.canonical-t2-demo.v1",
    observedAt,
    invariantPosition: covenant.underlyingIntent,
    allow: {
      claimId: aaplon.id,
      decision: allowCase.evaluation.decision,
      ruleResults: allowCase.evaluation.ruleResults,
      proofHash: proof.proofHash,
      evidenceRoot: buildEvidenceRoot(evidenceRecords),
    },
    refuse: {
      claimId: aaplx.id,
      decision: refuseCase.evaluation.decision,
      ruleResults: refuseCase.evaluation.ruleResults,
      executableProofCreated: false,
    },
    assertion:
      "Same economic intent and operator; different claim truth produces a different authorization outcome.",
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
