import { Decision, evaluateTransition } from "../policy/evaluator.mjs";
import {
  buildTransitionProof,
  sha256Canonical,
} from "../proof/transition-proof.mjs";

export const RuntimeStage = Object.freeze({
  PROPOSED: "PROPOSED",
  REFUSED: "REFUSED",
  ESCALATED: "ESCALATED",
  PROVEN: "PROVEN",
});

/**
 * Evaluate one exact proposed economic transition.
 *
 * This is the canonical offchain orchestration entry point. It does not execute
 * a transaction and does not grant generic wallet authority.
 */
export function proposeEconomicTransition({
  covenant,
  passport,
  market,
  portfolioPostState,
  authority,
  proposal,
  now = new Date(),
}) {
  const evaluation = evaluateTransition({
    covenant,
    passport,
    market,
    portfolioPostState,
    authority,
    proposal,
    now,
  });

  const packet = {
    schemaVersion: "covenant.runtime-proposal.v1",
    stage:
      evaluation.decision === Decision.ALLOW
        ? RuntimeStage.PROPOSED
        : evaluation.decision === Decision.ESCALATE
          ? RuntimeStage.ESCALATED
          : RuntimeStage.REFUSED,
    decision: evaluation.decision,
    positionId: evaluation.positionId,
    operator: evaluation.operator,
    claimId: evaluation.claimId,
    covenantVersion: evaluation.covenantVersion,
    covenantHash: sha256Canonical(covenant),
    claimPassportHash: sha256Canonical(passport),
    proposalHash: sha256Canonical(proposal),
    ruleResults: evaluation.ruleResults,
    executable: false,
  };

  return {
    packet: { ...packet, packetHash: sha256Canonical(packet) },
    evaluation,
  };
}

/**
 * Convert an ALLOW evaluation into a proof packet bound to one exact execution.
 *
 * A policy ALLOW is deliberately not executable until an execution commitment,
 * pre/post state, evidence root, nonce and expiry are bound into the proof.
 */
export function proveEconomicTransition({
  proposalResult,
  covenant,
  passport,
  evidenceRecords,
  preState,
  proposedPostState,
  authorityRef,
  executionCommitment,
  nonce,
  expiresAt,
}) {
  if (!proposalResult?.evaluation) {
    throw new Error("proposalResult from proposeEconomicTransition is required");
  }
  if (proposalResult.evaluation.decision !== Decision.ALLOW) {
    throw new Error(
      "Only an ALLOW proposal can become a proof-carrying economic transition",
    );
  }
  if (!executionCommitment) {
    throw new Error("executionCommitment is required before authority can unlock");
  }

  const proof = buildTransitionProof({
    evaluation: proposalResult.evaluation,
    covenant,
    passport,
    evidenceRecords,
    preState,
    proposedPostState,
    authorityRef,
    executionCommitment,
    nonce,
    expiresAt,
  });

  const packet = {
    schemaVersion: "covenant.runtime-proof.v1",
    stage: RuntimeStage.PROVEN,
    decision: Decision.ALLOW,
    executable: true,
    positionId: proof.positionId,
    operator: proof.operator,
    claimPassportHash: proof.claimPassportHash,
    covenantHash: proof.covenantHash,
    evidenceRoot: proof.evidenceRoot,
    executionCommitmentHash: proof.executionCommitmentHash,
    proofHash: proof.proofHash,
    expiresAt: proof.expiresAt,
  };

  return {
    packet: { ...packet, packetHash: sha256Canonical(packet) },
    proof,
  };
}

/**
 * Convenience function for API/UI consumers that need one object but must keep
 * the PROPOSE -> PROVE boundary explicit.
 */
export function prepareEconomicTransition({
  evaluationInput,
  proofInput,
}) {
  const proposalResult = proposeEconomicTransition(evaluationInput);

  if (proposalResult.evaluation.decision !== Decision.ALLOW) {
    return {
      proposal: proposalResult.packet,
      proof: null,
      executable: false,
    };
  }

  if (!proofInput) {
    return {
      proposal: proposalResult.packet,
      proof: null,
      executable: false,
    };
  }

  const proven = proveEconomicTransition({
    proposalResult,
    covenant: evaluationInput.covenant,
    passport: evaluationInput.passport,
    ...proofInput,
  });

  return {
    proposal: proposalResult.packet,
    proof: proven.proof,
    proofPacket: proven.packet,
    executable: true,
  };
}
