import {
  CLAIMS,
  CURRENT_USER_PROFILE,
  LATEST_REPAIR_REVALIDATION,
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
  "claim.permanent_delegate": "No permanent token-moving delegate",
  "claim.direct_issuer_redemption_minimum_usd": "Direct issuer redemption works for small positions",
  "eligibility.user_can_acquire": "This profile can acquire the target representation",
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
    window.location.href="/runtime?scenario=switch";
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
    form.forbidPermanentDelegate.checked=state.covenant.forbidPermanentDelegate;
    form.enforceSmallHolderRedemption.checked=state.covenant.enforceSmallHolderRedemption;
    form.maxDirectIssuerRedemptionMinimumUsd.value=state.covenant.maxDirectIssuerRedemptionMinimumUsd;
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
      forbidPermanentDelegate:form.forbidPermanentDelegate.checked,
      enforceSmallHolderRedemption:form.enforceSmallHolderRedemption.checked,
      maxDirectIssuerRedemptionMinimumUsd:Number(form.maxDirectIssuerRedemptionMinimumUsd.value),
      maxRouteImpactBps:Number(form.maxRouteImpactBps.value),
      maxAutonomousUsd:Number(form.maxAutonomousUsd.value),
      allowedOperators:nextAllowed,updatedAt:new Date().toISOString()};
    state.position.version+=1;state.position.nonce+=1;state.pending=null;
    saveState(state,{type:"COVENANT_AMEND",message:"Protection settings updated; old pending authorization invalidated"});
    render();renderGlobal();
    document.querySelector("#saveFeedback").textContent="Saved. Future actions must satisfy protection v"+state.covenant.version+".";
  });
  document.querySelector("#presetAcquire").addEventListener("click",()=>{
    form.requireIssuerMapping.checked=true;form.requireToken2022.checked=true;form.forbidPermanentDelegate.checked=false;form.enforceSmallHolderRedemption.checked=false;
    form.maxDirectIssuerRedemptionMinimumUsd.value=100;form.maxRouteImpactBps.value=50;form.maxAutonomousUsd.value=100;form.querySelector("#opAcquire").checked=true;form.querySelector("#opMigrate").checked=true;
  });
  document.querySelector("#presetRepair").addEventListener("click",()=>{
    form.requireIssuerMapping.checked=true;form.requireToken2022.checked=true;form.forbidPermanentDelegate.checked=true;form.enforceSmallHolderRedemption.checked=false;
    form.maxDirectIssuerRedemptionMinimumUsd.value=100;form.maxRouteImpactBps.value=500;form.maxAutonomousUsd.value=100;form.querySelector("#opAcquire").checked=true;form.querySelector("#opMigrate").checked=true;
  });
  document.querySelector("#presetSmallHolder")?.addEventListener("click",()=>{
    form.requireIssuerMapping.checked=true;form.requireToken2022.checked=true;form.forbidPermanentDelegate.checked=false;form.enforceSmallHolderRedemption.checked=true;
    form.maxDirectIssuerRedemptionMinimumUsd.value=100;form.maxRouteImpactBps.value=500;form.maxAutonomousUsd.value=100;form.querySelector("#opAcquire").checked=true;form.querySelector("#opMigrate").checked=true;
  });
  render();
}

function currentEligibility(claim){
  return claim?.eligibility?.[CURRENT_USER_PROFILE.id] || {
    canAcquire: null,
    status: "UNKNOWN",
    source: null,
    note: "No current eligibility evidence is bound for this profile."
  };
}

function claimOutcome(claim){
  const reasons=[];
  let ruleFit=true;
  if(state.covenant.requireIssuerMapping) reasons.push({ok:true,label:"Official issuer verified"});
  if(state.covenant.requireToken2022){
    const ok=claim.tokenProgram==="Token-2022";
    ruleFit=ruleFit&&ok;
    reasons.push({ok,label:ok?"Supported Token-2022 representation":"Unsupported token standard"});
  }
  if(state.covenant.forbidPermanentDelegate){
    if(claim.permanentDelegateActive===false) reasons.push({ok:true,label:"No permanent delegate on this mint"});
    else if(claim.permanentDelegateActive===true){ruleFit=false;reasons.push({ok:false,label:"Active permanent delegate on this mint"});}
    else {ruleFit=false;reasons.push({ok:false,label:"Permanent-delegate state unknown"});}
  }
  if(state.covenant.enforceSmallHolderRedemption){
    const minimum=claim.directIssuerRedemptionMinimumUsd;
    const cap=state.covenant.maxDirectIssuerRedemptionMinimumUsd;
    if(typeof minimum==="number" && minimum<=cap) reasons.push({ok:true,label:"Direct issuer redemption minimum $"+minimum.toLocaleString()});
    else if(typeof minimum==="number"){ruleFit=false;reasons.push({ok:false,label:"Direct issuer redemption minimum $"+minimum.toLocaleString()+" exceeds your $"+cap.toLocaleString()+" limit"});}
    else {ruleFit=false;reasons.push({ok:false,label:"Direct issuer redemption minimum unknown"});}
  }
  const eligibility=currentEligibility(claim);
  const eligible=eligibility.status==="VERIFIED" && eligibility.canAcquire===true;
  return {ruleFit,reasons,eligibility,eligible,usable:ruleFit&&eligible};
}

function matrixStatus(label,kind){
  return '<span class="matrix-status matrix-status--'+kind+'">'+label+"</span>";
}

function money(value){
  return typeof value==="number" ? "$"+value.toLocaleString("en-US") : "UNKNOWN";
}

function claimMatrixHtml(){
  const aaplx=CLAIMS.AAPLx;
  const aaplon=CLAIMS.AAPLon;
  const left=claimOutcome(aaplx);
  const right=claimOutcome(aaplon);

  const delegateCell=(claim)=>claim.permanentDelegateActive===true
    ? matrixStatus("ACTIVE","bad")
    : claim.permanentDelegateActive===false
      ? matrixStatus("NONE","good")
      : matrixStatus("UNKNOWN","neutral");

  const eligibilityCell=(outcome)=>outcome.eligibility.status!=="VERIFIED"
    ? matrixStatus("UNKNOWN","neutral")
    : outcome.eligible
      ? matrixStatus("YES","good")
      : matrixStatus("NO","bad");

  const fitCell=(outcome)=>outcome.ruleFit
    ? matrixStatus("FITS RULES","good")
    : matrixStatus("RULE MISMATCH","bad");

  const usableCell=(outcome)=>outcome.usable
    ? matrixStatus("USABLE HERE","good")
    : matrixStatus("NOT USABLE HERE","bad");

  return `
    <div class="claim-matrix__row claim-matrix__head">
      <div>What matters</div>
      <div><span class="eyebrow">${aaplx.issuer}</span><strong>AAPLx</strong></div>
      <div><span class="eyebrow">${aaplon.issuer}</span><strong>AAPLon</strong></div>
    </div>
    <div class="claim-matrix__row"><div><strong>Exact issuer mapping</strong><small>Representation identity</small></div><div>${matrixStatus("VERIFIED","good")}</div><div>${matrixStatus("VERIFIED","good")}</div></div>
    <div class="claim-matrix__row"><div><strong>Token standard</strong><small>Exact mint program</small></div><div>Token-2022</div><div>Token-2022</div></div>
    <div class="claim-matrix__row"><div><strong>Permanent delegate</strong><small>Mint-level transfer / burn authority</small></div><div>${delegateCell(aaplx)}</div><div>${delegateCell(aaplon)}</div></div>
    <div class="claim-matrix__row"><div><strong>Direct issuer redemption minimum</strong><small>Official issuer terms</small></div><div><strong>${money(aaplx.directIssuerRedemptionMinimumUsd)}</strong></div><div><strong>${money(aaplon.directIssuerRedemptionMinimumUsd)}</strong></div></div>
    <div class="claim-matrix__row"><div><strong>${CURRENT_USER_PROFILE.label} acquisition eligibility</strong><small>Current issuer evidence</small></div><div>${eligibilityCell(left)}</div><div>${eligibilityCell(right)}</div></div>
    <div class="claim-matrix__row claim-matrix__row--decision"><div><strong>Fits your representation rules</strong><small>Does not include jurisdiction eligibility</small></div><div>${fitCell(left)}</div><div>${fitCell(right)}</div></div>
    <div class="claim-matrix__row claim-matrix__row--decision"><div><strong>Usable for this profile now</strong><small>Rules + eligibility</small></div><div>${usableCell(left)}</div><div>${usableCell(right)}</div></div>
  `;
}

function claimCardHtml(claim){
  const outcome=claimOutcome(claim);
  const current=state.position.currentClaim===claim.symbol?badge("CURRENT","info"):"";
  const ruleBadge=badge(outcome.ruleFit?"RULE FIT":"RULE MISMATCH",outcome.ruleFit?"allow":"refuse");
  const eligibilityBadge=badge(
    outcome.eligibility.status!=="VERIFIED"?"ELIGIBILITY UNKNOWN":outcome.eligible?"ELIGIBLE HERE":"NOT ELIGIBLE HERE",
    outcome.eligible?"allow":"refuse"
  );
  return `<article class="representation-card ${outcome.ruleFit?"representation-card--qualifies":"representation-card--blocked"}">
    <div class="representation-card__head"><div><span class="eyebrow">${claim.issuer}</span><h2>${claim.symbol}</h2></div><div>${current}${ruleBadge}${eligibilityBadge}</div></div>
    <p class="representation-sub">Apple exposure on Solana · ${claim.tokenProgram}</p>
    <div class="check-list">${outcome.reasons.map(r=>"<div>"+(r.ok?"✓":"×")+" "+r.label+"</div>").join("")}<div>${outcome.eligible?"✓":"×"} ${outcome.eligibility.note}</div></div>
    <details class="representation-details"><summary>Representation details</summary><dl class="facts"><div><dt>Exact mint</dt><dd><code>${claim.mint}</code></dd></div><div><dt>Provenance</dt><dd>${claim.provenance}</dd></div><div><dt>Permanent delegate</dt><dd>${claim.permanentDelegateActive===true?"ACTIVE":claim.permanentDelegateActive===false?"NONE":"UNKNOWN"}</dd></div><div><dt>Direct issuer redemption minimum</dt><dd>${money(claim.directIssuerRedemptionMinimumUsd)}</dd></div><div><dt>${CURRENT_USER_PROFILE.label} eligible</dt><dd>${outcome.eligibility.status==="VERIFIED"?(outcome.eligible?"YES":"NO"):"UNKNOWN"}</dd></div>${claim.permanentDelegateAddress?`<div><dt>Delegate address</dt><dd><code>${claim.permanentDelegateAddress}</code></dd></div>`:""}</dl></details>
    <button class="button button--secondary" data-adopt="${claim.symbol}">LOAD AS LOCAL DEMO POSITION</button>
  </article>`;
}

function pageClaims(){
  const root=document.querySelector("#claimsRoot");
  const matrix=document.querySelector("#claimMatrix");
  const profile=document.querySelector("#comparisonProfile");
  const ruleSummary=document.querySelector("#comparisonRules");
  const latestRepair=document.querySelector("#latestRepairCheck");

  const render=()=>{
    if(profile) profile.textContent=CURRENT_USER_PROFILE.label;
    if(ruleSummary){
      const rules=["Verified issuer","Token-2022"];
      if(state.covenant.forbidPermanentDelegate) rules.push("No permanent delegate");
      if(state.covenant.enforceSmallHolderRedemption) rules.push("Issuer redemption minimum ≤ $"+state.covenant.maxDirectIssuerRedemptionMinimumUsd.toLocaleString());
      rules.push("Route impact ≤ "+state.covenant.maxRouteImpactBps+" bps");
      ruleSummary.textContent=rules.join(" · ");
    }
    if(matrix) matrix.innerHTML=claimMatrixHtml();
    if(latestRepair){
      const route=LATEST_REPAIR_REVALIDATION;
      latestRepair.innerHTML=
        '<div><span class="eyebrow">LATEST RECORDED REPAIR CHECK</span><strong>'+
        route.sourceClaim+' → '+route.targetClaim+
        '</strong><small>Run '+route.run+' · point-in-time live route evidence</small></div>'+
        '<div><span class="eyebrow">ROUTE IMPACT</span><strong>'+
        route.routeImpactBps.toFixed(2)+' bps</strong><small>Owner ceiling '+route.ceilingBps+' bps</small></div>'+
        '<div><span class="eyebrow">COVENANT OUTCOME</span><strong class="repair-outcome">'+
        route.outcome.replaceAll("_"," ")+'</strong><small>'+route.note+'</small></div>';
    }
    root.innerHTML=Object.values(CLAIMS).map(claimCardHtml).join("");
    root.querySelectorAll("[data-adopt]").forEach(button=>button.addEventListener("click",()=>{
      const symbol=button.dataset.adopt;state.position.currentClaim=symbol;
      if((state.position.balances[symbol]||0)===0)state.position.balances[symbol]=symbol==="AAPLx"?3000000:29421175;
      state.position.version+=1;state.position.nonce+=1;state.pending=null;
      saveState(state,{type:"ADOPT_CLAIM",message:symbol+" became the local demo representation"});render();renderGlobal();
    }));
  };
  render();
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
    downloadButton=document.querySelector("#downloadProof"), repairFlow=document.querySelector("#repairFlow");
  let lastEvaluation=null;

  const renderProtectionEvent=()=>{
    const targetEligibility=currentEligibility(CLAIMS.AAPLon);
    const targetEligible=targetEligibility.status==="VERIFIED" && targetEligibility.canAcquire===true;
    const route=LATEST_REPAIR_REVALIDATION;
    const routePass=route.routeImpactBps<=route.ceilingBps;
    const targetRuleFit=CLAIMS.AAPLon.permanentDelegateActive===false;
    const canSwitch=targetRuleFit&&targetEligible&&routePass;
    const stage=(n,eyebrow,title,copy,kind)=>'<article class="repair-stage repair-stage--'+kind+'"><span class="repair-stage__number">'+n+'</span><span class="eyebrow">'+eyebrow+'</span><strong>'+title+'</strong><small>'+copy+'</small></article>';
    repairFlow.innerHTML=
      stage("01","CURRENT REPRESENTATION","AAPLx","Apple exposure is currently represented by AAPLx.","neutral")+
      stage("02","RULE MISMATCH","PERMANENT DELEGATE ACTIVE","Your selected repair rule rejects this mint-level authority.","fail")+
      stage("03","CANDIDATE REPRESENTATION",targetRuleFit?"AAPLon · RULE FIT":"AAPLon · RULE MISMATCH",targetRuleFit?"No PermanentDelegate extension on the exact mint.":"Candidate fails the same representation rule.",targetRuleFit?"pass":"fail")+
      stage("04","PROFILE ELIGIBILITY",targetEligible?"ELIGIBLE HERE":"NOT ELIGIBLE HERE",CURRENT_USER_PROFILE.label+" · "+targetEligibility.note,targetEligible?"pass":"fail")+
      stage("05","LATEST RECORDED ROUTE",route.routeImpactBps.toFixed(2)+" BPS",routePass?"Inside owner ceiling "+route.ceilingBps+" bps.":"Above owner ceiling "+route.ceilingBps+" bps · run "+route.run+".",routePass?"pass":"fail")+
      stage("06","COVENANT OUTCOME",canSwitch?"SAFE SWITCH":"SAFE NO ACTION",canSwitch?"Every gate passes; an exact transition may be prepared.":"At least one required gate fails, so no transition authority exists.",canSwitch?"pass":"outcome");
  };

  const renderState=()=>{
    const pending=state.pending;
    proofBox.textContent=pending?pending.proofHash.slice(0,18)+"… · "+pending.status+" · expires "+new Date(pending.expiresAt).toLocaleTimeString():"No pending authorization";
    authorizeButton.disabled=!pending||pending.status!=="PROVEN";
    executeButton.disabled=!pending||pending.status!=="AUTHORIZED";
    downloadButton.disabled=!pending;
  };

  const showEvaluation=(evaluation)=>{
    const user=userDecision(evaluation.decision);
    const isRepair=form.operator.value==="MIGRATE" && form.targetClaim.value==="AAPLon" && form.profile.value==="repairLatest";
    const eligibilityResult=evaluation.ruleResults.find(r=>r.rule==="eligibility.user_can_acquire");
    const routeResult=evaluation.ruleResults.find(r=>r.rule==="market.max_route_impact_bps");
    const repairAllowed=isRepair && evaluation.decision==="ALLOW";

    decision.textContent=isRepair ? (repairAllowed?"SAFE SWITCH":"SAFE NO ACTION") : user.label;
    decision.className="user-decision user-decision--"+(repairAllowed?"allow":isRepair?"refuse":user.kind);

    if(isRepair){
      if(repairAllowed){
        decisionHuman.textContent="AAPLon fits your representation rules, this profile is eligible, and the exact route is inside your ceiling. COVENANT may prepare one exact switch authorization.";
      }else{
        const blockers=[];
        if(eligibilityResult?.outcome!=="ALLOW") blockers.push(CURRENT_USER_PROFILE.label+" is not eligible for AAPLon under the bound issuer evidence");
        if(routeResult?.outcome!=="ALLOW" && typeof routeResult?.actual==="number") blockers.push("the latest recorded route is "+Number(routeResult.actual).toFixed(2)+" bps versus your "+routeResult.expected+" bps ceiling");
        decisionHuman.textContent="AAPLon fits the representation rule, but "+(blockers.length?blockers.join(" and "):"at least one required gate still fails")+". COVENANT correctly creates no authority.";
      }
    }else{
      decisionHuman.textContent=user.copy;
    }

    resultCard.className="result-card result-card--"+(repairAllowed?"allow":isRepair?"refuse":user.kind);
    authTitle.textContent=evaluation.decision==="ALLOW"
      ? (isRepair ? "Every gate passed. One exact switch can be prepared." : "Protection check passed.")
      : isRepair
        ? "Correct outcome: no authority."
        : "No automatic authority.";
    renderRules(evaluation);
    generateButton.disabled=evaluation.decision!=="ALLOW";
    executeStatus.textContent=evaluation.decision==="ALLOW"
      ?"COVENANT can now prepare one exact authorization for this action."
      :isRepair
        ?"Candidate found, but eligibility and/or route gates fail. No transition authority is created."
        :evaluation.decision==="ESCALATE"
          ?"This action needs review before authority can exist."
          :"This action is blocked by your rules.";
  };

  form.addEventListener("submit",e=>{
    e.preventDefault();
    lastEvaluation=evaluateTransition({state,operator:form.operator.value,targetClaim:form.targetClaim.value,amountUsd:Number(form.amountUsd.value),profileKey:form.profile.value});
    showEvaluation(lastEvaluation);
  });

  generateButton.addEventListener("click",async()=>{
    try{
      if(!lastEvaluation)throw new Error("Run a protection check first.");
      state.pending=await generateProof({state,evaluation:lastEvaluation});
      saveState(state,{type:"AUTHORIZATION_PREPARED",message:"Exact browser authorization prepared"});
      executeStatus.textContent="Exact action prepared. It still cannot run until explicitly confirmed.";
      renderState();
    }catch(error){executeStatus.textContent=error.message;}
  });
  authorizeButton.addEventListener("click",()=>{
    try{
      authorizePending(state);
      executeStatus.textContent="Exact demo action confirmed. Apply it to mutate browser-local state.";
      renderState();
    }catch(error){executeStatus.textContent=error.message;}
  });
  executeButton.addEventListener("click",async()=>{
    try{
      const before=state.position.currentClaim||"NONE";
      const receipt=await executePending(state);
      const after=state.position.currentClaim||"NONE";
      executeStatus.textContent=before!==after
        ?"Apple position still protected. Representation changed "+before+" → "+after+". Receipt "+receipt.receiptHash.slice(0,16)+"…"
        :"Protected demo action applied. Receipt "+receipt.receiptHash.slice(0,16)+"…";
      renderState();renderGlobal();
    }catch(error){executeStatus.textContent=error.message;}
  });
  downloadButton.addEventListener("click",()=>{if(state.pending)downloadJson("covenant-transition-authorization.json",state.pending);});

  document.querySelector("#loadAcquireScenario")?.addEventListener("click",()=>{
    state=resetState();
    form.operator.value="ACQUIRE";
    form.targetClaim.value="AAPLx";
    form.profile.value="t3";
    form.amountUsd.value="100";
    executeStatus.textContent="Historical acquisition inputs loaded. Current profile eligibility is still enforced.";
    renderState();renderGlobal();form.requestSubmit();
  });

  document.querySelector("#loadMigrateScenario")?.addEventListener("click",()=>{
    state=loadPreset("t4-source");
    form.operator.value="MIGRATE";
    form.targetClaim.value="AAPLon";
    form.profile.value="repairLatest";
    form.amountUsd.value="10";
    state.pending=null;
    executeStatus.textContent="Latest recorded repair revalidation loaded.";
    renderProtectionEvent();renderState();renderGlobal();form.requestSubmit();
  });

  const params=new URLSearchParams(window.location.search);
  if(params.get("scenario")==="switch"){
    queueMicrotask(()=>document.querySelector("#loadMigrateScenario")?.click());
  } else if(params.get("scenario")==="acquire"){
    queueMicrotask(()=>document.querySelector("#loadAcquireScenario")?.click());
  }

  document.querySelector("#toggleTechnical")?.addEventListener("click",()=>{
    document.body.classList.toggle("show-technical");
    document.querySelector("#toggleTechnical").textContent=document.body.classList.contains("show-technical")?"HIDE TECHNICAL DETAILS":"SHOW TECHNICAL DETAILS";
  });

  renderProtectionEvent();
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
