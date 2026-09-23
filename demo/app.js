import {
  CLAIMS,
  EVIDENCE_PROFILES,
  loadState,
  saveState,
  resetState,
  loadPreset,
  evaluateTransition,
  generateProof,
  authorizePending,
  executePending,
  downloadJson,
} from "./state.js";

let state = loadState();

function moneyRaw(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function tokenAmount(raw, decimals, maxFractionDigits = decimals) {
  const value = Number(raw || 0) / (10 ** decimals);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Math.min(2, maxFractionDigits),
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}

function badge(text, kind = "neutral") {
  return '<span class="badge badge--' + kind + '">' + text + "</span>";
}

function renderGlobal() {
  document.querySelectorAll("[data-position-id]").forEach((el) => el.textContent = state.position.id);
  document.querySelectorAll("[data-position-intent]").forEach((el) => el.textContent = state.position.intent);
  document.querySelectorAll("[data-position-version]").forEach((el) => el.textContent = state.position.version);
  document.querySelectorAll("[data-position-nonce]").forEach((el) => el.textContent = state.position.nonce);
  document.querySelectorAll("[data-current-claim]").forEach((el) => el.textContent = state.position.currentClaim || "NONE");
  document.querySelectorAll("[data-covenant-version]").forEach((el) => el.textContent = state.covenant.version);
  document.querySelectorAll("[data-local-status]").forEach((el) => {
    el.textContent = state.position.frozen ? "FROZEN" : "LOCAL SANDBOX";
  });
}

function setupNav() {
  const page = document.body.dataset.page;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.dataset.nav === page) a.setAttribute("aria-current", "page");
  });
}

function pagePosition() {
  const form = document.querySelector("#positionForm");
  const render = () => {
    form.intent.value = state.position.intent;
    form.positionId.value = state.position.id;
    form.currentClaim.value = state.position.currentClaim || "";
    document.querySelector("#balanceUSDC").textContent = tokenAmount(state.position.balances.USDC, 6, 2);
    document.querySelector("#balanceAAPLx").textContent = tokenAmount(state.position.balances.AAPLx, 8, 8);
    document.querySelector("#balanceAAPLon").textContent = tokenAmount(state.position.balances.AAPLon, 9, 9);
    document.querySelector("#positionState").innerHTML =
      badge(state.position.frozen ? "FROZEN" : "ACTIVE", state.position.frozen ? "refuse" : "allow") +
      badge("v" + state.position.version + " / nonce " + state.position.nonce, "neutral");
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    state.position.intent = form.intent.value.trim() || "APPLE ECONOMIC EXPOSURE";
    state.position.id = form.positionId.value.trim() || "APPLE-001";
    const desired = form.currentClaim.value || null;
    if (desired !== state.position.currentClaim) {
      state.position.currentClaim = desired;
      state.position.version += 1;
      state.position.nonce += 1;
    }
    saveState(state, { type: "POSITION_UPDATE", message: "Invariant Position updated" });
    render();
    renderGlobal();
  });
  document.querySelector("#loadT3").addEventListener("click", () => {
    state = loadPreset("t3-settled"); render(); renderGlobal();
  });
  document.querySelector("#loadT4").addEventListener("click", () => {
    state = loadPreset("t4-source"); render(); renderGlobal();
  });
  document.querySelector("#resetAll").addEventListener("click", () => {
    state = resetState(); render(); renderGlobal();
  });
  document.querySelector("#toggleFreeze").addEventListener("click", () => {
    state.position.frozen = !state.position.frozen;
    state.position.version += 1;
    state.position.nonce += 1;
    saveState(state, { type: state.position.frozen ? "FREEZE" : "UNFREEZE", message: "Position control changed" });
    render(); renderGlobal();
  });
  render();
}

function pageCovenant() {
  const form = document.querySelector("#covenantForm");
  const render = () => {
    form.requireIssuerMapping.checked = state.covenant.requireIssuerMapping;
    form.requireToken2022.checked = state.covenant.requireToken2022;
    form.requireLendingOptIn.checked = state.covenant.requireLendingOptIn;
    form.maxRouteImpactBps.value = state.covenant.maxRouteImpactBps;
    form.maxAutonomousUsd.value = state.covenant.maxAutonomousUsd;
    ["ACQUIRE", "MIGRATE", "FREEZE"].forEach((op) => {
      form.querySelector('[value="' + op + '"]').checked = state.covenant.allowedOperators.includes(op);
    });
    document.querySelector("#covenantStamp").textContent = "COVENANT v" + state.covenant.version;
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const nextAllowed = [...form.querySelectorAll('input[name="operator"]:checked')].map((x) => x.value);
    state.covenant = {
      ...state.covenant,
      version: state.covenant.version + 1,
      requireIssuerMapping: form.requireIssuerMapping.checked,
      requireToken2022: form.requireToken2022.checked,
      requireLendingOptIn: form.requireLendingOptIn.checked,
      maxRouteImpactBps: Number(form.maxRouteImpactBps.value),
      maxAutonomousUsd: Number(form.maxAutonomousUsd.value),
      allowedOperators: nextAllowed,
      updatedAt: new Date().toISOString(),
    };
    state.position.version += 1;
    state.position.nonce += 1;
    state.pending = null;
    saveState(state, { type: "COVENANT_AMEND", message: "Covenant amended; prior pending authorization invalidated" });
    render(); renderGlobal();
    document.querySelector("#saveFeedback").textContent = "Saved. Prior pending authorization invalidated by version/nonce change.";
  });
  document.querySelector("#presetAcquire").addEventListener("click", () => {
    form.requireLendingOptIn.checked = false;
    form.maxRouteImpactBps.value = 50;
    form.maxAutonomousUsd.value = 100;
  });
  document.querySelector("#presetRepair").addEventListener("click", () => {
    form.requireLendingOptIn.checked = true;
    form.maxRouteImpactBps.value = 500;
    form.maxAutonomousUsd.value = 100;
  });
  render();
}

function claimCardHtml(claim) {
  const optIn = claim.lendingOptIn === true
    ? badge("VERIFIED TRUE", "allow")
    : badge("UNKNOWN", "refuse");
  const current = state.position.currentClaim === claim.symbol ? badge("CURRENT", "info") : "";
  return `
    <article class="claim-detail">
      <div class="claim-detail__top">
        <div><span class="eyebrow">${claim.issuer}</span><h2>${claim.symbol}</h2></div>
        <div>${current}</div>
      </div>
      <dl class="facts">
        <div><dt>Claim ID</dt><dd>${claim.id}</dd></div>
        <div><dt>Exact mint</dt><dd><code>${claim.mint}</code></dd></div>
        <div><dt>Token program</dt><dd>Token-2022</dd></div>
        <div><dt>Holder opt-in before collateral lending</dt><dd>${optIn}</dd></div>
        <div><dt>Provenance</dt><dd>${claim.provenance}</dd></div>
      </dl>
      <button class="button button--secondary" data-adopt="${claim.symbol}">Set as current local representation</button>
    </article>`;
}

function pageClaims() {
  const root = document.querySelector("#claimsRoot");
  const render = () => {
    root.innerHTML = Object.values(CLAIMS).map(claimCardHtml).join("");
    root.querySelectorAll("[data-adopt]").forEach((button) => {
      button.addEventListener("click", () => {
        const symbol = button.dataset.adopt;
        state.position.currentClaim = symbol;
        if ((state.position.balances[symbol] || 0) === 0) {
          state.position.balances[symbol] = symbol === "AAPLx" ? 3000000 : 29421175;
        }
        state.position.version += 1;
        state.position.nonce += 1;
        state.pending = null;
        saveState(state, { type: "ADOPT_CLAIM", message: symbol + " became the local current representation" });
        render(); renderGlobal();
      });
    });
  };
  render();
}

function renderRules(evaluation) {
  const root = document.querySelector("#ruleResults");
  root.innerHTML = evaluation.ruleResults.map((r) => `
    <div class="rule-row">
      <div><code>${r.rule}</code><small>${r.reason}</small></div>
      <strong class="rule-outcome rule-outcome--${r.outcome.toLowerCase()}">${r.outcome}</strong>
      <div class="rule-values"><span>actual</span><code>${r.actual === null ? "UNKNOWN" : JSON.stringify(r.actual)}</code></div>
      <div class="rule-values"><span>expected</span><code>${JSON.stringify(r.expected)}</code></div>
    </div>`).join("");
}

function pageRuntime() {
  const form = document.querySelector("#runtimeForm");
  const decision = document.querySelector("#decision");
  const proofBox = document.querySelector("#proofBox");
  const executeStatus = document.querySelector("#executeStatus");
  const generateButton = document.querySelector("#generateProof");
  const authorizeButton = document.querySelector("#authorizeProof");
  const executeButton = document.querySelector("#executeMutation");
  const downloadButton = document.querySelector("#downloadProof");
  let lastEvaluation = null;

  const renderState = () => {
    document.querySelector("#runtimePosition").textContent =
      state.position.id + " · " + (state.position.currentClaim || "NO CURRENT CLAIM") +
      " · v" + state.position.version + " / nonce " + state.position.nonce;
    document.querySelector("#runtimeBalances").textContent =
      "USDC " + tokenAmount(state.position.balances.USDC, 6, 2) +
      " · AAPLx " + tokenAmount(state.position.balances.AAPLx, 8, 8) +
      " · AAPLon " + tokenAmount(state.position.balances.AAPLon, 9, 9);
    const pending = state.pending;
    proofBox.textContent = pending
      ? pending.proofHash + " · " + pending.status + " · expires " + pending.expiresAt
      : "No pending authorization";
    authorizeButton.disabled = !pending || pending.status !== "PROVEN";
    executeButton.disabled = !pending || pending.status !== "AUTHORIZED";
    downloadButton.disabled = !pending;
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    lastEvaluation = evaluateTransition({
      state,
      operator: form.operator.value,
      targetClaim: form.targetClaim.value,
      amountUsd: Number(form.amountUsd.value),
      profileKey: form.profile.value,
    });
    decision.textContent = lastEvaluation.decision;
    decision.className = "decision-large decision-large--" + lastEvaluation.decision.toLowerCase();
    document.querySelector("#evidenceNote").textContent = lastEvaluation.evidenceNote;
    renderRules(lastEvaluation);
    generateButton.disabled = lastEvaluation.decision !== "ALLOW";
    executeStatus.textContent = lastEvaluation.decision === "ALLOW"
      ? "Policy passed. ALLOW is still non-executable until an exact proof is generated and authorized."
      : "No transition authority exists for this proposal.";
  });

  generateButton.addEventListener("click", async () => {
    try {
      if (!lastEvaluation) throw new Error("Evaluate a proposal first.");
      state.pending = await generateProof({ state, evaluation: lastEvaluation });
      saveState(state, { type: "PROOF_GENERATED", message: "Fresh browser authorization packet generated" });
      executeStatus.textContent = "Fresh authorization packet generated. It is still non-executable until authorized.";
      renderState();
    } catch (error) {
      executeStatus.textContent = error.message;
    }
  });

  authorizeButton.addEventListener("click", () => {
    try {
      authorizePending(state);
      executeStatus.textContent = "Exact local transition authorized. Execute to mutate browser sandbox state.";
      renderState();
    } catch (error) {
      executeStatus.textContent = error.message;
    }
  });

  executeButton.addEventListener("click", async () => {
    try {
      const receipt = await executePending(state);
      executeStatus.textContent =
        receipt.outcome + ": local sandbox state mutated. Receipt " + receipt.receiptHash.slice(0, 16) + "…";
      renderState(); renderGlobal();
    } catch (error) {
      executeStatus.textContent = error.message;
    }
  });

  downloadButton.addEventListener("click", () => {
    if (state.pending) downloadJson("covenant-transition-authorization.json", state.pending);
  });

  document.querySelector("#loadAcquireScenario").addEventListener("click", () => {
    state = resetState();
    form.operator.value = "ACQUIRE";
    form.targetClaim.value = "AAPLx";
    form.profile.value = "t3";
    form.amountUsd.value = "100";
    executeStatus.textContent = "Loaded T3 ACQUIRE sandbox scenario.";
    renderState(); renderGlobal();
  });

  document.querySelector("#loadMigrateScenario").addEventListener("click", () => {
    state = loadPreset("t4-source");
    form.operator.value = "MIGRATE";
    form.targetClaim.value = "AAPLon";
    form.profile.value = "t4";
    form.amountUsd.value = "10";
    executeStatus.textContent = "Loaded T4 self-healing sandbox scenario.";
    renderState(); renderGlobal();
  });

  renderState();
}

function pageProofs() {
  const receipts = document.querySelector("#localReceipts");
  const render = () => {
    receipts.innerHTML = state.receipts.length
      ? state.receipts.map((r) => `
          <article class="receipt-mini">
            <div>${badge(r.outcome, r.outcome === "MIGRATED" ? "info" : "allow")}</div>
            <strong>${r.proofHash.slice(0, 18)}…</strong>
            <span>${r.environment}</span>
            <code>${r.receiptHash}</code>
          </article>`).join("")
      : '<div class="empty-state">No local receipts yet. Execute a sandbox transition from Runtime.</div>';
  };
  document.querySelector("#exportState").addEventListener("click", () => downloadJson("covenant-browser-sandbox.json", state));
  render();
}

function boot() {
  setupNav();
  renderGlobal();
  const page = document.body.dataset.page;
  if (page === "position") pagePosition();
  if (page === "covenant") pageCovenant();
  if (page === "claims") pageClaims();
  if (page === "runtime") pageRuntime();
  if (page === "proofs") pageProofs();
}

boot();
