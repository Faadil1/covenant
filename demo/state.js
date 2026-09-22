export const STORAGE_KEY = "covenant.demo.state.v2";

export const CLAIMS = {
  AAPLx: {
    id: "apple:xstocks:aaplx",
    symbol: "AAPLx",
    issuer: "Backed Assets (JE) Limited",
    mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    decimals: 8,
    tokenProgram: "Token-2022",
    lendingOptIn: null,
    provenance: "xStocks official asset API + Solana RPC",
  },
  AAPLon: {
    id: "apple:ondo:aaplon",
    symbol: "AAPLon",
    issuer: "Ondo",
    mint: "123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo",
    decimals: 9,
    tokenProgram: "Token-2022",
    lendingOptIn: true,
    provenance: "Ondo official repository + Solana RPC",
  },
};

export const EVIDENCE_PROFILES = {
  t3: {
    id: "verified-t3",
    label: "Verified T3 ACQUIRE snapshot",
    observedAt: "2026-09-22T07:19:30.869Z",
    routeImpactBps: { AAPLx: 19.98, AAPLon: 471.29 },
    note: "Recorded Stocklana fork proof snapshot; not current market data.",
  },
  t4: {
    id: "verified-t4",
    label: "Verified T4 SELF-HEALING snapshot",
    observedAt: "2026-09-22T13:31:57.384Z",
    routeImpactBps: { AAPLx: 0, AAPLon: 248.14 },
    note: "Recorded self-healing fork proof snapshot; not current market data.",
  },
  stale: {
    id: "stale-demo",
    label: "Stale evidence simulation",
    observedAt: null,
    routeImpactBps: { AAPLx: 19.98, AAPLon: 248.14 },
    stale: true,
    note: "Synthetic fail-closed demonstration.",
  },
};

export function freshState() {
  return {
    schemaVersion: "covenant.browser-sandbox.v2",
    position: {
      id: "APPLE-001",
      intent: "APPLE ECONOMIC EXPOSURE",
      version: 0,
      nonce: 0,
      currentClaim: null,
      frozen: false,
      balances: {
        USDC: 200000000,
        AAPLx: 0,
        AAPLon: 0,
      },
    },
    covenant: {
      version: 1,
      requireIssuerMapping: true,
      requireToken2022: true,
      requireLendingOptIn: false,
      maxRouteImpactBps: 50,
      maxAutonomousUsd: 100,
      allowedOperators: ["ACQUIRE", "MIGRATE", "FREEZE"],
      updatedAt: new Date().toISOString(),
    },
    pending: null,
    receipts: [],
    events: [],
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    return parsed?.schemaVersion === "covenant.browser-sandbox.v2"
      ? parsed
      : freshState();
  } catch {
    return freshState();
  }
}

export function saveState(state, event = null) {
  if (event) {
    state.events = Array.isArray(state.events) ? state.events : [];
    state.events.unshift({
      at: new Date().toISOString(),
      ...event,
    });
    state.events = state.events.slice(0, 30);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("covenant-state-changed", { detail: state }));
}

export function resetState() {
  const state = freshState();
  saveState(state, { type: "RESET", message: "Browser sandbox reset" });
  return state;
}

export function loadPreset(name) {
  const state = freshState();
  if (name === "t3-settled") {
    state.position.version = 1;
    state.position.nonce = 1;
    state.position.currentClaim = "AAPLx";
    state.position.balances.USDC = 100000000;
    state.position.balances.AAPLx = 29334103;
    state.events = [{
      at: new Date().toISOString(),
      type: "PRESET",
      message: "Loaded verified T3 post-ACQUIRE state into local sandbox",
    }];
  }
  if (name === "t4-source") {
    state.position.version = 1;
    state.position.nonce = 1;
    state.position.currentClaim = "AAPLx";
    state.position.balances.USDC = 0;
    state.position.balances.AAPLx = 3000000;
    state.covenant.requireLendingOptIn = true;
    state.covenant.maxRouteImpactBps = 500;
    state.events = [{
      at: new Date().toISOString(),
      type: "PRESET",
      message: "Loaded verified T4 pre-MIGRATE state into local sandbox",
    }];
  }
  saveState(state);
  return state;
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = canonicalize(value[key]);
      return acc;
    }, {});
  }
  return value;
}

export async function sha256Canonical(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function evaluateTransition({ state, operator, targetClaim, amountUsd, profileKey }) {
  const profile = EVIDENCE_PROFILES[profileKey] || EVIDENCE_PROFILES.t3;
  const claim = CLAIMS[targetClaim];
  const results = [];
  const push = (rule, outcome, reason, actual, expected) =>
    results.push({ rule, outcome, reason, actual, expected });

  if (!claim) {
    push("claim.exists", "REFUSE", "CLAIM_UNKNOWN", targetClaim, "known Claim");
  } else {
    if (state.covenant.requireIssuerMapping) {
      push("claim.issuer_mapping", "ALLOW", "RULE_PASS", true, true);
    }
    if (state.covenant.requireToken2022) {
      push(
        "claim.token_program",
        claim.tokenProgram === "Token-2022" ? "ALLOW" : "REFUSE",
        claim.tokenProgram === "Token-2022" ? "RULE_PASS" : "TOKEN_PROGRAM_NOT_ALLOWED",
        claim.tokenProgram,
        "Token-2022",
      );
    }
    if (state.covenant.requireLendingOptIn) {
      const knownTrue = claim.lendingOptIn === true;
      push(
        "claim.lending_opt_in",
        knownTrue ? "ALLOW" : "REFUSE",
        knownTrue ? "RULE_PASS" : claim.lendingOptIn == null ? "EVIDENCE_UNKNOWN" : "RULE_FAILED",
        claim.lendingOptIn,
        true,
      );
    }
    if (profile.stale) {
      push("market.freshness", "REFUSE", "EVIDENCE_STALE", null, "fresh evidence");
    } else {
      const impact = profile.routeImpactBps[targetClaim];
      push(
        "market.max_route_impact_bps",
        impact <= state.covenant.maxRouteImpactBps ? "ALLOW" : "REFUSE",
        impact <= state.covenant.maxRouteImpactBps ? "RULE_PASS" : "PRICE_IMPACT_EXCEEDED",
        impact,
        state.covenant.maxRouteImpactBps,
      );
    }
  }

  const operatorAllowed = state.covenant.allowedOperators.includes(operator);
  push(
    "authority.operator",
    operatorAllowed ? "ALLOW" : "REFUSE",
    operatorAllowed ? "RULE_PASS" : "AUTHORITY_OPERATOR_NOT_ALLOWED",
    operator,
    state.covenant.allowedOperators,
  );

  const amount = Number(amountUsd);
  const capOutcome = Number.isFinite(amount) && amount <= state.covenant.maxAutonomousUsd
    ? "ALLOW"
    : "ESCALATE";
  push(
    "authority.autonomous_cap",
    capOutcome,
    capOutcome === "ALLOW" ? "RULE_PASS" : "AUTONOMOUS_CAP_EXCEEDED",
    amount,
    state.covenant.maxAutonomousUsd,
  );

  if (state.position.frozen) {
    push("position.frozen", "REFUSE", "POSITION_FROZEN", true, false);
  }

  if (operator === "MIGRATE") {
    if (!state.position.currentClaim) {
      push("migration.source", "REFUSE", "CURRENT_CLAIM_MISSING", null, "current Claim");
    } else if (state.position.currentClaim === targetClaim) {
      push("migration.target", "REFUSE", "MIGRATION_TARGET_UNCHANGED", targetClaim, "different Claim");
    }
    if ((state.position.balances[state.position.currentClaim] || 0) <= 0) {
      push("migration.source_balance", "REFUSE", "SOURCE_CLAIM_BALANCE_EMPTY", 0, "> 0");
    }
  }

  const decision = results.some((r) => r.outcome === "REFUSE")
    ? "REFUSE"
    : results.some((r) => r.outcome === "ESCALATE")
      ? "ESCALATE"
      : "ALLOW";

  return {
    schemaVersion: "covenant.browser-evaluation.v1",
    decision,
    operator,
    targetClaim,
    amountUsd: amount,
    positionId: state.position.id,
    positionVersion: state.position.version,
    nonce: state.position.nonce,
    covenantVersion: state.covenant.version,
    evidenceProfile: profile.id,
    evidenceObservedAt: profile.observedAt,
    evidenceNote: profile.note,
    ruleResults: results,
  };
}

export async function generateProof({ state, evaluation }) {
  if (evaluation.decision !== "ALLOW") {
    throw new Error("Only ALLOW can become an executable demo proof.");
  }
  const expiresAt = new Date(Date.now() + 90_000).toISOString();
  const proofMaterial = {
    schemaVersion: "covenant.browser-proof.v1",
    positionId: state.position.id,
    positionVersion: state.position.version,
    nonce: state.position.nonce,
    covenantVersion: state.covenant.version,
    operator: evaluation.operator,
    targetClaim: evaluation.targetClaim,
    amountUsd: evaluation.amountUsd,
    evidenceProfile: evaluation.evidenceProfile,
    evidenceObservedAt: evaluation.evidenceObservedAt,
    expiresAt,
    ruleResults: evaluation.ruleResults,
  };
  const proofHash = await sha256Canonical(proofMaterial);
  return {
    ...proofMaterial,
    proofHash,
    status: "PROVEN",
    authorized: false,
    createdAt: new Date().toISOString(),
  };
}

export function authorizePending(state) {
  if (!state.pending || state.pending.status !== "PROVEN") {
    throw new Error("Generate a proof first.");
  }
  if (Date.parse(state.pending.expiresAt) <= Date.now()) {
    state.pending.status = "EXPIRED";
    saveState(state, { type: "PROOF_EXPIRED", message: "Pending proof expired before authorization" });
    throw new Error("Proof expired.");
  }
  if (
    state.pending.positionVersion !== state.position.version ||
    state.pending.nonce !== state.position.nonce
  ) {
    throw new Error("Position state changed. Fresh proof required.");
  }
  state.pending.status = "AUTHORIZED";
  state.pending.authorized = true;
  state.pending.authorizedAt = new Date().toISOString();
  saveState(state, { type: "AUTHORIZE", message: "Exact transition authorized in browser sandbox" });
  return state.pending;
}

export async function executePending(state) {
  const proof = state.pending;
  if (!proof || proof.status !== "AUTHORIZED") throw new Error("Authorize the proof first.");
  if (Date.parse(proof.expiresAt) <= Date.now()) throw new Error("Proof expired.");
  if (proof.positionVersion !== state.position.version || proof.nonce !== state.position.nonce) {
    throw new Error("Replay/stale proof refused: position version or nonce changed.");
  }

  const preState = structuredClone(state.position);
  let mutation;

  if (proof.operator === "ACQUIRE" && proof.targetClaim === "AAPLx") {
    const spend = Math.round(proof.amountUsd * 1_000_000);
    if (state.position.balances.USDC < spend) throw new Error("Insufficient sandbox USDC.");
    const receive = Math.round((29334103 / 100) * proof.amountUsd);
    state.position.balances.USDC -= spend;
    state.position.balances.AAPLx += receive;
    state.position.currentClaim = "AAPLx";
    mutation = { input: { USDC: spend }, output: { AAPLx: receive } };
  } else if (
    proof.operator === "MIGRATE" &&
    state.position.currentClaim === "AAPLx" &&
    proof.targetClaim === "AAPLon"
  ) {
    const source = state.position.balances.AAPLx;
    if (source <= 0) throw new Error("No AAPLx balance to migrate.");
    const receive = Math.round(source * (29421175 / 3000000));
    state.position.balances.AAPLx = 0;
    state.position.balances.AAPLon += receive;
    state.position.currentClaim = "AAPLon";
    mutation = { input: { AAPLx: source }, output: { AAPLon: receive } };
  } else {
    throw new Error("No verified browser execution fixture exists for this exact route.");
  }

  state.position.version += 1;
  state.position.nonce += 1;
  const postState = structuredClone(state.position);
  const receiptMaterial = {
    schemaVersion: "covenant.browser-receipt.v1",
    proofHash: proof.proofHash,
    outcome: proof.operator === "MIGRATE" ? "MIGRATED" : "EXECUTED",
    mutation,
    preState,
    postState,
    environment: "LOCAL_BROWSER_SANDBOX",
    observedAt: new Date().toISOString(),
  };
  const receiptHash = await sha256Canonical(receiptMaterial);
  const receipt = { ...receiptMaterial, receiptHash };

  state.receipts.unshift(receipt);
  state.pending = { ...proof, status: "CONSUMED", consumedAt: receipt.observedAt, receiptHash };
  saveState(state, {
    type: receipt.outcome,
    message: proof.operator + " mutated the local sandbox state",
  });
  return receipt;
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
