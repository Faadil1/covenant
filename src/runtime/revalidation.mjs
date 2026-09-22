import { Decision } from "../policy/evaluator.mjs";
import { proposeEconomicTransition } from "./covenant-runtime.mjs";
import { planRepresentationRepair } from "./repair-planner.mjs";

export const PositionHealth = Object.freeze({
  IN_COVENANT: "IN_COVENANT",
  OUT_OF_COVENANT: "OUT_OF_COVENANT",
  UNKNOWN: "UNKNOWN",
});

/**
 * Re-evaluate the current exact representation against current evidence.
 *
 * This produces a health transition and an optional non-executing repair plan.
 * It never generates or reissues an old proof for a new evidence state.
 * Already-issued proof exposure remains bounded by the onchain controls reported
 * in outstandingProofExposure.
 */
export function revalidateInvariantPosition({
  currentClaimId,
  currentPassport,
  covenant,
  market,
  portfolioPostState = {},
  authority,
  proposal,
  previousHealth = PositionHealth.UNKNOWN,
  alternateEvaluations = [],
  candidatePriority = [],
  now = new Date(),
}) {
  const result = proposeEconomicTransition({
    covenant,
    passport: currentPassport,
    market,
    portfolioPostState,
    authority,
    proposal,
    now,
  });

  const currentEvaluation = {
    claimId: result.evaluation.claimId,
    decision: result.evaluation.decision,
    ruleResults: result.evaluation.ruleResults,
  };

  const health =
    result.evaluation.decision === Decision.ALLOW
      ? PositionHealth.IN_COVENANT
      : PositionHealth.OUT_OF_COVENANT;

  const changed = previousHealth !== health;

  const repair =
    health === PositionHealth.OUT_OF_COVENANT
      ? planRepresentationRepair({
          currentClaimId,
          evaluations: [currentEvaluation, ...alternateEvaluations],
          authority,
          candidatePriority,
        })
      : null;

  return {
    schemaVersion: "covenant.position-revalidation.v1",
    previousHealth,
    health,
    changed,
    currentClaimId,
    decision: result.evaluation.decision,
    ruleResults: result.evaluation.ruleResults,
    proposalPacket: result.packet,
    repair,
    newTransitionRequiresFreshProof: true,
    outstandingProofExposure: {
      immediateEvidenceEpochRevocationImplemented: false,
      boundedBy: ["EXPIRY", "NONCE", "POSITION_VERSION", "OWNER_FREEZE_OR_AMENDMENT", "EVALUATOR_ROTATION"],
    },
    proofRequirement:
      health === PositionHealth.IN_COVENANT
        ? "ANY_NEW_TRANSITION_REQUIRES_FRESH_PROOF"
        : "CURRENT_REPRESENTATION_OUT_OF_COVENANT",
  };
}
