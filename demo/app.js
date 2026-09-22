const dialog = document.querySelector("#proofDialog");
const openers = [document.querySelector("#openProof"), document.querySelector("#openProofBottom")];
const close = document.querySelector("#closeProof");
const scenario = document.querySelector("#scenario");
const passportDialog = document.querySelector("#passportDialog");
const closePassport = document.querySelector("#closePassport");
const repairDialog = document.querySelector("#repairDialog");
const openRepairProof = document.querySelector("#openRepairProof");
const closeRepairProof = document.querySelector("#closeRepairProof");
const runDemo = document.querySelector("#runDemo");
let demoTimers = [];

openers.forEach((button) => button?.addEventListener("click", () => dialog.showModal()));
close?.addEventListener("click", () => dialog.close());
dialog?.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

const aaplxCard = document.querySelector("#aaplxCard");
const aaplonCard = document.querySelector("#aaplonCard");
const aaplxDecision = document.querySelector("#aaplxDecision");
const aaplonDecision = document.querySelector("#aaplonDecision");
const aaplxImpact = document.querySelector("#aaplxImpact");
const aaplonImpact = document.querySelector("#aaplonImpact");
const aaplxFooter = document.querySelector("#aaplxFooter");
const aaplonFooter = document.querySelector("#aaplonFooter");
const snapshotNote = document.querySelector("#snapshotNote");

function setDecision(el, value, kind) {
  el.textContent = value;
  el.className = "decision decision--" + kind;
}

function resetCards() {
  aaplxCard.className = "claim-card";
  aaplonCard.className = "claim-card";
}

function applyScenario(value) {
  resetCards();

  if (value === "verified") {
    aaplxCard.classList.add("claim-card--selected");
    setDecision(aaplxDecision, "ALLOW", "allow");
    setDecision(aaplonDecision, "REFUSE", "refuse");
    aaplxImpact.textContent = "19.98 bps";
    aaplonImpact.textContent = "471.29 bps";
    aaplxFooter.textContent = "QUALIFIES FOR ACQUIRE";
    aaplxFooter.className = "claim-footer";
    aaplonFooter.textContent = "PRICE_IMPACT_EXCEEDED";
    aaplonFooter.className = "claim-footer claim-footer--blocked";
    snapshotNote.textContent = "Verified technical-proof snapshot · 2026-09-22 07:19 UTC · values are not presented as current market data.";
    return;
  }

  if (value === "invalidate") {
    aaplxCard.classList.add("claim-card--invalidated");
    setDecision(aaplxDecision, "REFUSE", "refuse");
    setDecision(aaplonDecision, "REFUSE", "refuse");
    aaplxImpact.textContent = "STALE";
    aaplonImpact.textContent = "471.29 bps";
    aaplxFooter.textContent = "EVIDENCE_STALE · FAIL CLOSED";
    aaplxFooter.className = "claim-footer claim-footer--blocked";
    aaplonFooter.textContent = "PRICE_IMPACT_EXCEEDED";
    aaplonFooter.className = "claim-footer claim-footer--blocked";
    snapshotNote.textContent = "Synthetic demo scenario: the previously valid AAPLx market evidence is deliberately made stale to demonstrate fail-closed invalidation.";
    return;
  }

  aaplonCard.classList.add("claim-card--repair");
  setDecision(aaplxDecision, "REFUSE", "refuse");
  setDecision(aaplonDecision, "ALLOW", "allow");
  aaplxImpact.textContent = "0 bps*";
  aaplonImpact.textContent = "248.14 bps";
  aaplxFooter.textContent = "EVIDENCE_UNKNOWN · FAIL CLOSED";
  aaplxFooter.className = "claim-footer claim-footer--blocked";
  aaplonFooter.textContent = "VERIFIED MIGRATION TARGET";
  aaplonFooter.className = "claim-footer";
  snapshotNote.textContent = "Verified T4 self-healing snapshot · 2026-09-22 13:31 UTC. * AAPLx failed on missing required holder-opt-in evidence, not route impact. Repair Covenant max route impact: 500 bps.";
}

scenario?.addEventListener("change", (event) => applyScenario(event.target.value));
applyScenario("verified");

function stopNarrative() {
  demoTimers.forEach((timer) => clearTimeout(timer));
  demoTimers = [];
  if (runDemo) runDemo.textContent = "RUN DEMO";
}

function narrativeStep(delay, fn) {
  const timer = setTimeout(fn, delay);
  demoTimers.push(timer);
}

runDemo?.addEventListener("click", () => {
  if (demoTimers.length) {
    stopNarrative();
    return;
  }

  runDemo.textContent = "STOP DEMO";
  scenario.value = "verified";
  applyScenario("verified");
  document.querySelector("#covenant")?.scrollIntoView({ behavior: "smooth", block: "start" });

  narrativeStep(1600, () =>
    document.querySelector(".claim-stage")?.scrollIntoView({ behavior: "smooth", block: "start" }),
  );
  narrativeStep(3600, () =>
    document.querySelector(".transition-stage")?.scrollIntoView({ behavior: "smooth", block: "start" }),
  );
  narrativeStep(5600, () =>
    document.querySelector(".receipt-stage")?.scrollIntoView({ behavior: "smooth", block: "start" }),
  );
  narrativeStep(7600, () => {
    scenario.value = "invalidate";
    applyScenario("invalidate");
    document.querySelector(".claim-stage")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  narrativeStep(9800, () => {
    scenario.value = "repair";
    applyScenario("repair");
    document.querySelector("#repairProof")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  narrativeStep(12600, stopNarrative);
});

const passportData = {
  aaplx: {
    title: "AAPLx",
    claimId: "apple:xstocks:aaplx",
    issuer: "Backed Assets (JE) Limited",
    decimals: "8",
    mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    lendingStatus: "UNKNOWN",
    lendingClass: "UNKNOWN · NO AUTHORITATIVE EVIDENCE BOUND",
    source: "xStocks official asset API + Solana RPC getAccountInfo",
  },
  aaplon: {
    title: "AAPLon",
    claimId: "apple:ondo:aaplon",
    issuer: "Ondo",
    decimals: "9",
    mint: "123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo",
    lendingStatus: "VERIFIED · TRUE",
    lendingClass: "SIGNED / AUTHORITATIVE OFFCHAIN",
    source: "Ondo official repository + Solana RPC getAccountInfo",
  },
};

document.querySelectorAll("[data-passport]").forEach((button) => {
  button.addEventListener("click", () => {
    const data = passportData[button.dataset.passport];
    if (!data) return;
    document.querySelector("#passportTitle").textContent = data.title;
    document.querySelector("#passportClaimId").textContent = data.claimId;
    document.querySelector("#passportIssuer").textContent = data.issuer;
    document.querySelector("#passportDecimals").textContent = data.decimals;
    document.querySelector("#passportMint").textContent = data.mint;
    const lending = document.querySelector("#passportLendingStatus");
    lending.textContent = data.lendingStatus;
    lending.className = data.lendingStatus.startsWith("UNKNOWN")
      ? "evidence-unknown"
      : "evidence-pass";
    document.querySelector("#passportLendingClass").textContent = data.lendingClass;
    document.querySelector("#passportSource").textContent = data.source;
    passportDialog.showModal();
  });
});

closePassport?.addEventListener("click", () => passportDialog.close());
passportDialog?.addEventListener("click", (event) => {
  if (event.target === passportDialog) passportDialog.close();
});

openRepairProof?.addEventListener("click", () => repairDialog.showModal());
closeRepairProof?.addEventListener("click", () => repairDialog.close());
repairDialog?.addEventListener("click", (event) => {
  if (event.target === repairDialog) repairDialog.close();
});
