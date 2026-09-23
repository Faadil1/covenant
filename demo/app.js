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
let walletAddress = null;

const ruleLabels = {
  "claim.issuer_mapping": "Official issuer verified",
  "claim.token_program": "Supported Solana token standard",
  "claim.lending_opt_in": "Holder consent required for collateral lending",
  "market.freshness": "Market evidence is fresh",
  "market.max_route_impact_bps": "Route cost stays inside your limit",
  "authority.operator": "This action is allowed by your protection settings",
  "authority.autonomous_cap": "Action stays inside your automatic limit",
  "position.frozen": "Protection is active",
  "migration.source": "Current representation is known",
  "migration.target": "Switch changes representation",
  "migration.source_balance": "Current representation has a balance",
};

function tokenAmount(raw, decimals, maxFractionDigits = decimals) {
  const value = Number(raw || 0) / (10 ** decimals);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Math.min(2, maxFractionDigits),
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
}
function badge(text, kind="neutral"){return '<span class="badge badge--'+kind+'">'+text+"</span>";}
function shortAddress(value){return value ? value.slice(0,4)+"…"+value.slice(-4) : null;}
function userDecision(decision){
  if(decision==="ALLOW") return {label:"PROTECTED",kind:"allow",copy:"This exact action stays inside your protection rules."};
  if(decision==="REFUSE") return {label:"BLOCKED",kind:"refuse",copy:"COVENANT found at least one rule this action does not satisfy."};
  if(decision==="ESCALATE") return {label:"REVIEW NEEDED",kind:"escalate",copy:"The action exceeds your automatic limit and needs review."};
  return {label:"NOT CHECKED",kind:"neutral",copy:"Run a check to see whether this exact action stays inside your rules."};
}

function renderGlobal(){
  document.querySelectorAll("[data-position-id]").forEach(el=>el.textContent=state.position.id);
  document.querySelectorAll("[data-position-intent]").forEach(el=>el.textContent=state.position.intent);
  document.querySelectorAll("[data-position-version]").forEach(el=>el.textContent=state.position.version);
  document.querySelectorAll("[data-position-nonce]").forEach(el=>el.textContent=state.position.nonce);
  document.querySelectorAll("[data-current-claim]").forEach(el=>el.textContent=state.position.currentClaim||"NONE");
  document.querySelectorAll("[data-covenant-version]").forEach(el=>el.textContent=state.covenant.version);
  document.querySelectorAll("[data-route-cap]").forEach(el=>el.textContent=state.covenant.maxRouteImpactBps+" bps");
  document.querySelectorAll("[data-auto-cap]").forEach(el=>el.textContent="$"+state.covenant.maxAutonomousUsd);
  document.querySelectorAll("[data-wallet-connect]").forEach(btn=>{
    btn.textContent=walletAddress ? shortAddress(walletAddress) : "CONNECT WALLET";
    btn.classList.toggle("wallet-pill--connected",Boolean(walletAddress));
  });
}

function setupNav(){
  const page=document.body.dataset.page;
  document.querySelectorAll("[data-nav]").forEach(a=>{if(a.dataset.nav===page)a.setAttribute("aria-current","page");});
}
function setupWallet(){
  document.querySelectorAll("[data-wallet-connect]").forEach(button=>{
    button.addEventListener("click",async()=>{
      try{
        const provider=window.solana;
        if(!provider?.connect){
          button.textContent="WALLET NOT DETECTED";
          setTimeout(()=>renderGlobal(),2500);
          return;
        }
        const result=await provider.connect();
        walletAddress=(result?.publicKey||provider.publicKey)?.toString()||null;
        renderGlobal();
      }catch(error){
        button.textContent="CONNECTION CANCELLED";
        setTimeout(()=>renderGlobal(),2000);
      }
    });
  });
}

function pageHome(){
  const render=()=>{
    const protectedNow=Boolean(state.position.currentClaim)&&!state.position.frozen;
    const status=document.querySelector("[data-home-status]");
    const copy=document.querySelector("[data-home-copy]");
    const orb=document.querySelector("[data-home-orb]");
    if(status){
      status.textContent=protectedNow?"PROTECTED":"NOT PROTECTED YET";
      status.className=protectedNow?"status-protected":"";
    }
    if(copy) copy.textContent=protectedNow
      ? state.position.currentClaim+" is the current demo representation. Run a Protection Check to verify the next action."
      : "Start with the demo position to see COVENANT check a representation against your rules.";
    if(orb) orb.classList.toggle("protection-orb--active",protectedNow);
  };
  document.querySelector("#startProtection")?.addEventListener("click",()=>{
    state=loadPreset("t4-source");
    window.location.href="/runtime";
  });
  render();
}

function pagePosition(){
  const form=document.querySelector("#positionForm");
  const render=()=>{
    form.intent.value=state.position.intent;
    form.positionId.value=state.position.id;
    form.currentClaim.value=state.position.currentClaim||"";
    document.querySelector("#balanceUSDC").textContent=tokenAmount(state.position.balances.USDC,6,2);
    document.querySelector("#balanceAAPLx").textContent=tokenAmount(state.position.balances.AAPLx,8,8);
    document.querySelector("#balanceAAPLon").textContent=tokenAmount(state.position.balances.AAPLon,9,9);
    document.querySelector("#positionState").innerHTML=
      badge(state.position.frozen?"PAUSED":state.position.currentClaim?"PROTECTED":"READY",
        state.position.frozen?"refuse":state.position.currentClaim?"allow":"neutral");
  };
  form.addEventListener("submit",e=>{
    e.preventDefault();
    state.position.intent=form.intent.value.trim()||"APPLE ECONOMIC EXPOSURE";
    state.position.id=form.positionId.value.trim()||"APPLE-001";
    const desired=form.currentClaim.value||null;
    if(desired!==state.position.currentClaim){state.position.currentClaim=desired;state.position.version+=1;state.position.nonce+=1;}
    saveState(state,{type:"POSITION_UPDATE",message:"Demo position updated"});render();renderGlobal();
  });
  document.querySelector("#loadT3").addEventListener("click",()=>{state=loadPreset("t3-settled");render();renderGlobal();});
  document.querySelector("#loadT4").addEventListener("click",()=>{state=loadPreset("t4-source");render();renderGlobal();});
  document.querySelector("#resetAll").addEventListener("click",()=>{state=resetState();render();renderGlobal();});
  document.querySelector("#toggleFreeze").addEventListener("click",()=>{
    state.position.frozen=!state.position.frozen;state.position.version+=1;state.position.nonce+=1;
    saveState(state,{type:state.position.frozen?"FREEZE":"UNFREEZE",message:"Protection state changed"});render();renderGlobal();
  });
  render();
}

function pageCovenant(){
  const form=document.querySelector("#covenantForm");
  const render=()=>{
    form.requireIssuerMapping.checked=state.covenant.requireIssuerMapping;
    form.requireToken2022.checked=state.covenant.requireToken2022;
    form.requireLendingOptIn.checked=state.covenant.requireLendingOptIn;
    form.maxRouteImpactBps.value=state.covenant.maxRouteImpactBps;
    form.maxAutonomousUsd.value=state.covenant.maxAutonomousUsd;
    ["ACQUIRE","MIGRATE","FREEZE"].forEach(op=>{const el=form.querySelector('[value="'+op+'"]');if(el)el.checked=state.covenant.allowedOperators.includes(op);});
    document.querySelector("#covenantStamp").textContent="PROTECTION v"+state.covenant.version;
  };
  form.addEventListener("submit",e=>{
    e.preventDefault();
    const nextAllowed=[...form.querySelectorAll('input[name="operator"]:checked')].map(x=>x.value);
    state.covenant={...state.covenant,version:state.covenant.version+1,
      requireIssuerMapping:form.requireIssuerMapping.checked,
      requireToken2022:form.requireToken2022.checked,
      requireLendingOptIn:form.requireLendingOptIn.checked,
      maxRouteImpactBps:Number(form.maxRouteImpactBps.value),
      maxAutonomousUsd:Number(form.maxAutonomousUsd.value),
      allowedOperators:nextAllowed,updatedAt:new Date().toISOString()};
    state.position.version+=1;state.position.nonce+=1;state.pending=null;
    saveState(state,{type:"COVENANT_AMEND",message:"Protection settings updated; old pending authorization invalidated"});
    render();renderGlobal();
    document.querySelector("#saveFeedback").textContent="Saved. Future actions must satisfy protection v"+state.covenant.version+".";
  });
  document.querySelector("#presetAcquire").addEventListener("click",()=>{
    form.requireIssuerMapping.checked=true;form.requireToken2022.checked=true;form.requireLendingOptIn.checked=false;
    form.maxRouteImpactBps.value=50;form.maxAutonomousUsd.value=100;form.querySelector("#opAcquire").checked=true;form.querySelector("#opMigrate").checked=true;
  });
  document.querySelector("#presetRepair").addEventListener("click",()=>{
    form.requireIssuerMapping.checked=true;form.requireToken2022.checked=true;form.requireLendingOptIn.checked=true;
    form.maxRouteImpactBps.value=500;form.maxAutonomousUsd.value=100;form.querySelector("#opAcquire").checked=true;form.querySelector("#opMigrate").checked=true;
  });
  render();
}

function claimOutcome(claim){
  const reasons=[];
  let qualifies=true;
  if(state.covenant.requireIssuerMapping) reasons.push("Official issuer verified");
  if(state.covenant.requireToken2022&&claim.tokenProgram!=="Token-2022"){qualifies=false;reasons.push("Unsupported token standard");}
  if(state.covenant.requireLendingOptIn){
    if(claim.lendingOptIn===true)reasons.push("Holder lending consent verified");
    else {qualifies=false;reasons.push("Lending-consent evidence unknown");}
  }
  return {qualifies,reasons};
}
function claimCardHtml(claim){
  const outcome=claimOutcome(claim);
  const current=state.position.currentClaim===claim.symbol?badge("CURRENT","info"):"";
  return `<article class="representation-card ${outcome.qualifies?"representation-card--qualifies":"representation-card--blocked"}">
    <div class="representation-card__head"><div><span class="eyebrow">${claim.issuer}</span><h2>${claim.symbol}</h2></div><div>${current}${badge(outcome.qualifies?"QUALIFIES":"BLOCKED",outcome.qualifies?"allow":"refuse")}</div></div>
    <p class="representation-sub">Apple exposure on Solana · ${claim.tokenProgram}</p>
    <div class="check-list">${outcome.reasons.map(r=>"<div>"+(r.includes("unknown")?"!":"✓")+" "+r+"</div>").join("")}</div>
    <details class="representation-details"><summary>Representation details</summary><dl class="facts"><div><dt>Exact mint</dt><dd><code>${claim.mint}</code></dd></div><div><dt>Provenance</dt><dd>${claim.provenance}</dd></div><div><dt>Holder lending consent</dt><dd>${claim.lendingOptIn===true?"VERIFIED":"UNKNOWN"}</dd></div></dl></details>
    <button class="button button--secondary" data-adopt="${claim.symbol}">USE AS DEMO POSITION</button>
  </article>`;
}
function pageClaims(){
  const root=document.querySelector("#claimsRoot");
  const render=()=>{
    root.innerHTML=Object.values(CLAIMS).map(claimCardHtml).join("");
    root.querySelectorAll("[data-adopt]").forEach(button=>button.addEventListener("click",()=>{
      const symbol=button.dataset.adopt;state.position.currentClaim=symbol;
      if((state.position.balances[symbol]||0)===0)state.position.balances[symbol]=symbol==="AAPLx"?3000000:29421175;
      state.position.version+=1;state.position.nonce+=1;state.pending=null;
      saveState(state,{type:"ADOPT_CLAIM",message:symbol+" became the demo representation"});render();renderGlobal();
    }));
  };render();
}

function renderRules(evaluation){
  const root=document.querySelector("#ruleResults");
  root.innerHTML=evaluation.ruleResults.map(r=>{
    const ok=r.outcome==="ALLOW", review=r.outcome==="ESCALATE";
    return `<div class="user-rule-row"><span class="rule-icon ${ok?"rule-icon--ok":review?"rule-icon--review":"rule-icon--bad"}">${ok?"✓":review?"?":"×"}</span><div><strong>${ruleLabels[r.rule]||r.rule}</strong><small>${r.reason==="RULE_PASS"?"Rule satisfied":r.reason.replaceAll("_"," ").toLowerCase()}</small></div><span class="rule-user-outcome">${ok?"PASS":review?"REVIEW":"BLOCK"}</span><details class="technical-rule"><summary>details</summary><code>actual=${r.actual===null?"UNKNOWN":JSON.stringify(r.actual)} · expected=${JSON.stringify(r.expected)}</code></details></div>`;
  }).join("");
}

function pageRuntime(){
  const form=document.querySelector("#runtimeForm"), decision=document.querySelector("#decision"),
    decisionHuman=document.querySelector("#decisionHuman"), resultCard=document.querySelector("#resultCard"),
    proofBox=document.querySelector("#proofBox"), executeStatus=document.querySelector("#executeStatus"),
    authTitle=document.querySelector("#authTitle"), generateButton=document.querySelector("#generateProof"),
    authorizeButton=document.querySelector("#authorizeProof"), executeButton=document.querySelector("#executeMutation"),
    downloadButton=document.querySelector("#downloadProof");
  let lastEvaluation=null;

  const renderState=()=>{
    const pending=state.pending;
    proofBox.textContent=pending?pending.proofHash.slice(0,18)+"… · "+pending.status+" · expires "+new Date(pending.expiresAt).toLocaleTimeString():"No pending authorization";
    authorizeButton.disabled=!pending||pending.status!=="PROVEN";
    executeButton.disabled=!pending||pending.status!=="AUTHORIZED";
    downloadButton.disabled=!pending;
  };
  const showEvaluation=(evaluation)=>{
    const user=userDecision(evaluation.decision);
    decision.textContent=user.label;decision.className="user-decision user-decision--"+user.kind;
    decisionHuman.textContent=user.copy;resultCard.className="result-card result-card--"+user.kind;
    authTitle.textContent=evaluation.decision==="ALLOW"?"Protection check passed.":"No automatic authority.";
    renderRules(evaluation);
    generateButton.disabled=evaluation.decision!=="ALLOW";
    executeStatus.textContent=evaluation.decision==="ALLOW"
      ?"COVENANT can now prepare one exact authorization for this action."
      :evaluation.decision==="ESCALATE"?"This action needs review before authority can exist.":"This action is blocked by your rules.";
  };
  form.addEventListener("submit",e=>{
    e.preventDefault();
    lastEvaluation=evaluateTransition({state,operator:form.operator.value,targetClaim:form.targetClaim.value,amountUsd:Number(form.amountUsd.value),profileKey:form.profile.value});
    showEvaluation(lastEvaluation);
  });
  generateButton.addEventListener("click",async()=>{
    try{if(!lastEvaluation)throw new Error("Run a protection check first.");state.pending=await generateProof({state,evaluation:lastEvaluation});
      saveState(state,{type:"AUTHORIZATION_PREPARED",message:"Exact browser authorization prepared"});
      executeStatus.textContent="Exact action prepared. It still cannot run until explicitly confirmed.";renderState();
    }catch(error){executeStatus.textContent=error.message;}
  });
  authorizeButton.addEventListener("click",()=>{try{authorizePending(state);executeStatus.textContent="Exact demo action confirmed. Apply it to mutate browser-local state.";renderState();}catch(error){executeStatus.textContent=error.message;}});
  executeButton.addEventListener("click",async()=>{try{const receipt=await executePending(state);executeStatus.textContent="Protected demo action applied. Receipt "+receipt.receiptHash.slice(0,16)+"…";renderState();renderGlobal();}catch(error){executeStatus.textContent=error.message;}});
  downloadButton.addEventListener("click",()=>{if(state.pending)downloadJson("covenant-transition-authorization.json",state.pending);});
  document.querySelector("#loadAcquireScenario").addEventListener("click",()=>{
    state=resetState();form.operator.value="ACQUIRE";form.targetClaim.value="AAPLx";form.profile.value="t3";form.amountUsd.value="100";
    executeStatus.textContent="Healthy Apple acquisition scenario loaded.";renderState();renderGlobal();form.requestSubmit();
  });
  document.querySelector("#loadMigrateScenario").addEventListener("click",()=>{
    state=loadPreset("t4-source");form.operator.value="MIGRATE";form.targetClaim.value="AAPLon";form.profile.value="t4";form.amountUsd.value="10";
    executeStatus.textContent="Representation-switch scenario loaded.";renderState();renderGlobal();form.requestSubmit();
  });
  document.querySelector("#toggleTechnical")?.addEventListener("click",()=>{
    document.body.classList.toggle("show-technical");
    document.querySelector("#toggleTechnical").textContent=document.body.classList.contains("show-technical")?"HIDE TECHNICAL DETAILS":"SHOW TECHNICAL DETAILS";
  });
  renderState();
}

function pageProofs(){
  const receipts=document.querySelector("#localReceipts");
  receipts.innerHTML=state.receipts.length?state.receipts.map(r=>`<article class="receipt-mini"><div>${badge(r.outcome,r.outcome==="MIGRATED"?"info":"allow")}</div><strong>${r.proofHash.slice(0,18)}…</strong><span>${r.environment}</span><code>${r.receiptHash}</code></article>`).join(""):'<div class="empty-state">No local demo receipts yet. Apply a protected demo action from Check.</div>';
  document.querySelector("#exportState").addEventListener("click",()=>downloadJson("covenant-browser-sandbox.json",state));
}

function boot(){
  setupNav();setupWallet();renderGlobal();
  const page=document.body.dataset.page;
  if(page==="home")pageHome();
  if(page==="position")pagePosition();
  if(page==="covenant")pageCovenant();
  if(page==="claims")pageClaims();
  if(page==="runtime")pageRuntime();
  if(page==="proofs")pageProofs();
}
boot();
