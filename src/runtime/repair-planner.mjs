import { Decision } from "../policy/evaluator.mjs";

export const RepairOutcome = Object.freeze({
  STAY: "STAY",
  MIGRATE: "MIGRATE",
  FREEZE: "FREEZE",
  ESCALATE: "ESCALATE",
});

function byClaimId(evaluations) {
  return new Map(evaluations.map((item) => [item.claimId, item]));
}

function normalizedPriority(candidatePriority = []) {
  return [...new Set(candidatePriority.filter(Boolean))];
}

/**
 * Plan the next representation-level repair for an Invariant Position.
 *
 * This planner never executes. A MIGRATE result is only a new proposal and must
 * pass the normal PROPOSE -> PROVE -> AUTHORIZE -> EXECUTE runtime path.
 *
 * Human-agency rule:
 * - if multiple alternate claims qualify and the Covenant/owner did not provide
 *   an explicit priority order, the planner ESCALATES rather than choosing.
 */
export function planRepresentationRepair({
  currentClaimId,
  evaluations,
  authority = {},
  candidatePriority = [],
}) {
  if (!currentClaimId) {
    return {
      outcome: RepairOutcome.ESCALATE,
      reasonCode: "NO_CURRENT_CLAIM",
      executable: false,
    };
  }

  const index = byClaimId(evaluations);
  const current = index.get(currentClaimId);

  if (!current) {
    return {
      outcome: RepairOutcome.ESCALATE,
      reasonCode: "CURRENT_CLAIM_EVALUATION_MISSING",
      executable: false,
    };
  }

  if (current.decision === Decision.ALLOW) {
    return {
      outcome: RepairOutcome.STAY,
      reasonCode: "CURRENT_REPRESENTATION_IN_COVENANT",
      currentClaimId,
      executable: false,
    };
  }

  const allowedOperators = new Set(authority.allowedOperators ?? []);
  const alternatives = evaluations.filter(
    (item) =>
      item.claimId !== currentClaimId && item.decision === Decision.ALLOW,
  );

  if (!allowedOperators.has("MIGRATE")) {
    if (allowedOperators.has("FREEZE")) {
      return {
        outcome: RepairOutcome.FREEZE,
        reasonCode: "MIGRATION_NOT_DELEGATED",
        currentClaimId,
        failedDecision: current.decision,
        executable: false,
      };
    }

    return {
      outcome: RepairOutcome.ESCALATE,
      reasonCode: "REPAIR_AUTHORITY_NOT_DELEGATED",
      currentClaimId,
      failedDecision: current.decision,
      executable: false,
    };
  }

  if (alternatives.length === 0) {
    if (allowedOperators.has("FREEZE")) {
      return {
        outcome: RepairOutcome.FREEZE,
        reasonCode: "NO_QUALIFYING_ALTERNATE_CLAIM",
        currentClaimId,
        executable: false,
      };
    }

    return {
      outcome: RepairOutcome.ESCALATE,
      reasonCode: "NO_QUALIFYING_ALTERNATE_CLAIM",
      currentClaimId,
      executable: false,
    };
  }

  const priority = normalizedPriority(candidatePriority);
  let target = null;

  if (priority.length > 0) {
    target = priority
      .map((claimId) => index.get(claimId))
      .find(
        (item) =>
          item &&
          item.claimId !== currentClaimId &&
          item.decision === Decision.ALLOW,
      );
  } else if (alternatives.length === 1) {
    target = alternatives[0];
  } else {
    return {
      outcome: RepairOutcome.ESCALATE,
      reasonCode: "AMBIGUOUS_REPAIR_CANDIDATE",
      currentClaimId,
      qualifyingAlternates: alternatives.map((item) => item.claimId),
      executable: false,
    };
  }

  if (!target) {
    return {
      outcome: RepairOutcome.ESCALATE,
      reasonCode: "PRIORITY_HAS_NO_QUALIFYING_CLAIM",
      currentClaimId,
      qualifyingAlternates: alternatives.map((item) => item.claimId),
      executable: false,
    };
  }

  return {
    outcome: RepairOutcome.MIGRATE,
    reasonCode: "QUALIFYING_ALTERNATE_FOUND",
    fromClaimId: currentClaimId,
    toClaimId: target.claimId,
    operator: "MIGRATE",
    requiresFreshEvidence: true,
    requiresFreshTransitionProof: true,
    executable: false,
    sourceFailure: {
      decision: current.decision,
      reasonCodes: (current.ruleResults ?? [])
        .filter((rule) => rule.outcome !== Decision.ALLOW)
        .map((rule) => rule.reasonCode),
    },
  };
}
