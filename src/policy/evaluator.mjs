const CLASS_RANK = {
  UNKNOWN: 0,
  HEURISTIC: 1,
  CURATED_RESEARCH: 2,
  LIVE_MARKET_OR_ORACLE: 3,
  SIGNED_OR_AUTHORITATIVE_OFFCHAIN: 4,
  ONCHAIN_DETERMINISTIC: 5,
};

export const Decision = Object.freeze({
  ALLOW: "ALLOW",
  ESCALATE: "ESCALATE",
  REFUSE: "REFUSE",
});

function atPath(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

function evidenceUsable(record, rule, nowMs) {
  if (!record || record.status !== "VERIFIED") {
    return { ok: false, reason: "EVIDENCE_UNKNOWN" };
  }

  const requiredClass = rule.minEvidenceClass;
  if (requiredClass) {
    const actualRank = CLASS_RANK[record.evidenceClass] ?? 0;
    const requiredRank = CLASS_RANK[requiredClass] ?? Number.MAX_SAFE_INTEGER;
    if (actualRank < requiredRank) {
      return { ok: false, reason: "EVIDENCE_CLASS_INSUFFICIENT" };
    }
  }

  if (rule.maxAgeSeconds != null) {
    const observedMs = Date.parse(record.observedAt);
    if (!Number.isFinite(observedMs)) {
      return { ok: false, reason: "EVIDENCE_TIME_INVALID" };
    }
    const ageSeconds = (nowMs - observedMs) / 1000;
    if (ageSeconds < 0 || ageSeconds > rule.maxAgeSeconds) {
      return { ok: false, reason: "EVIDENCE_STALE", ageSeconds };
    }
  }

  return { ok: true };
}

function compare(value, rule) {
  switch (rule.operator) {
    case "EQUALS":
      return Object.is(value, rule.expected);
    case "LTE":
      return typeof value === "number" && value <= rule.expected;
    case "GTE":
      return typeof value === "number" && value >= rule.expected;
    case "IN":
      return Array.isArray(rule.expected) && rule.expected.includes(value);
    default:
      throw new Error(`Unsupported operator: ${rule.operator}`);
  }
}

function outcomeFor(rule, evidenceCheck, compared) {
  if (!evidenceCheck.ok) {
    if (rule.onUnknown === Decision.ESCALATE) return Decision.ESCALATE;
    return Decision.REFUSE;
  }
  if (compared) return Decision.ALLOW;
  return rule.onFail === Decision.ESCALATE ? Decision.ESCALATE : Decision.REFUSE;
}

function precedence(outcome) {
  if (outcome === Decision.REFUSE) return 3;
  if (outcome === Decision.ESCALATE) return 2;
  return 1;
}

/**
 * Deterministically evaluates an exact proposed economic state transition.
 * AI/model output is intentionally outside this trust boundary.
 */
export function evaluateTransition({
  covenant,
  passport,
  market,
  portfolioPostState,
  eligibility,
  authority,
  proposal,
  now = new Date(),
}) {
  if (!covenant || !passport || !proposal) {
    throw new Error("covenant, passport and proposal are required");
  }

  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error("Invalid evaluation time");

  const context = {
    passport,
    market,
    portfolioPostState,
    eligibility,
    authority,
    proposal,
  };

  const ruleResults = [];

  for (const rule of covenant.rules) {
    const record = atPath(context, rule.evidencePath);
    const evidenceCheck = evidenceUsable(record, rule, nowMs);
    const value = evidenceCheck.ok ? record.value : undefined;
    const compared = evidenceCheck.ok ? compare(value, rule) : false;
    const outcome = outcomeFor(rule, evidenceCheck, compared);

    ruleResults.push({
      ruleId: rule.id,
      hard: rule.hard !== false,
      outcome,
      reasonCode:
        outcome === Decision.ALLOW
          ? "RULE_PASS"
          : evidenceCheck.ok
            ? rule.reasonCode || "RULE_FAILED"
            : evidenceCheck.reason,
      evidencePath: rule.evidencePath,
      evidenceClass: record?.evidenceClass ?? "UNKNOWN",
      observedAt: record?.observedAt ?? null,
      actual: evidenceCheck.ok ? value : null,
      expected: rule.expected,
      operator: rule.operator,
    });
  }

  // Exact transition authority is evaluated as part of the same proof.
  const allowedOperator = authority?.allowedOperators?.includes(proposal.operator);
  ruleResults.push({
    ruleId: "authority.operator",
    hard: true,
    outcome: allowedOperator ? Decision.ALLOW : Decision.REFUSE,
    reasonCode: allowedOperator ? "RULE_PASS" : "AUTHORITY_OPERATOR_NOT_ALLOWED",
    actual: proposal.operator,
    expected: authority?.allowedOperators ?? [],
    operator: "IN",
  });

  const maxAutonomousUsd = authority?.maxAutonomousTransitionUsd;
  const amountUsd = proposal.amountUsd;
  const amountOutcome =
    typeof maxAutonomousUsd !== "number" || typeof amountUsd !== "number"
      ? Decision.REFUSE
      : amountUsd <= maxAutonomousUsd
        ? Decision.ALLOW
        : Decision.ESCALATE;

  ruleResults.push({
    ruleId: "authority.autonomous_cap",
    hard: true,
    outcome: amountOutcome,
    reasonCode:
      amountOutcome === Decision.ALLOW
        ? "RULE_PASS"
        : amountOutcome === Decision.ESCALATE
          ? "AUTONOMOUS_CAP_EXCEEDED"
          : "AUTHORITY_UNKNOWN",
    actual: amountUsd ?? null,
    expected: maxAutonomousUsd ?? null,
    operator: "LTE",
  });

  const finalDecision = ruleResults.reduce(
    (decision, result) =>
      precedence(result.outcome) > precedence(decision) ? result.outcome : decision,
    Decision.ALLOW,
  );

  return {
    schemaVersion: "covenant.transition-proof.v1",
    decision: finalDecision,
    covenantId: covenant.id,
    covenantVersion: covenant.version,
    positionId: proposal.positionId,
    operator: proposal.operator,
    claimId: passport.id,
    ruleResults,
  };
}
