import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const JUPITER_QUOTE = process.env.JUPITER_QUOTE_URL || "https://lite-api.jup.ag/swap/v1/quote";
const XSTOCKS_API = "https://api.xstocks.fi/api/v2/public/assets";
const ONDO_CONSTANTS = "https://raw.githubusercontent.com/ondoprotocol/gm-solana-simulator/main/constants.rs";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const ONDO_EXPECTED = {
  AAPLon: "123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo",
  NVDAon: "gEGtLTPNQ7jcg25zTetkbmF7teoDLcrfTnQfmn2ondo"
};
const NOTIONALS = [25, 100, 500];

function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

async function fetchText(url, init = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.text();
    if (!response.ok) throw new Error("HTTP " + response.status + ": " + body.slice(0, 500));
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, init = {}, timeoutMs = 12000) {
  return JSON.parse(await fetchText(url, init, timeoutMs));
}

async function rpc(method, params) {
  const body = await fetchJson(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  if (body.error) throw new Error("RPC " + method + ": " + JSON.stringify(body.error));
  return body.result;
}

async function resolveXstock(symbol) {
  const url = XSTOCKS_API + "/" + symbol;
  const body = await fetchJson(url);
  const deployments = body.deployments || body.tokenDeployments || [];
  const solana = deployments.find((d) => d.network === "Solana");
  if (!solana || !solana.address) throw new Error(symbol + " has no official Solana deployment");
  return {
    mint: solana.address,
    source: url,
    issuer: "Backed Assets (JE) Limited",
    identityPayloadHash: sha256({ symbol: body.symbol, isin: body.isin, solana })
  };
}

function resolveOndo(symbol, constantsText) {
  const mint = ONDO_EXPECTED[symbol];
  const needleA = '("' + symbol + '", "' + mint + '")';
  const needleB = '("' + symbol + '","' + mint + '")';
  if (!constantsText.includes(needleA) && !constantsText.includes(needleB)) {
    throw new Error("Official Ondo constants no longer bind " + symbol + " to expected mint");
  }
  return {
    mint,
    source: ONDO_CONSTANTS,
    issuer: "Ondo",
    identityPayloadHash: sha256({ symbol, mint })
  };
}

async function inspectMint(mint) {
  const result = await rpc("getAccountInfo", [mint, { encoding: "jsonParsed", commitment: "confirmed" }]);
  if (!result || !result.value) throw new Error("Missing mint " + mint);
  const info = result.value.data && result.value.data.parsed && result.value.data.parsed.info;
  return {
    slot: result.context && result.context.slot,
    ownerProgram: result.value.owner,
    decimals: info && info.decimals,
    extensions: ((info && info.extensions) || []).map((x) => x.extension)
  };
}

async function quote(mint, notionalUsd) {
  const amount = notionalUsd * 1000000;
  const params = new URLSearchParams({
    inputMint: USDC,
    outputMint: mint,
    amount: String(amount),
    slippageBps: "50",
    restrictIntermediateTokens: "true"
  });
  const url = JUPITER_QUOTE + "?" + params.toString();
  try {
    const body = await fetchJson(url);
    return {
      status: "VERIFIED",
      source: url,
      inAmount: body.inAmount || String(amount),
      outAmount: body.outAmount || null,
      minOut: body.otherAmountThreshold || null,
      priceImpactPct: body.priceImpactPct || null,
      priceImpactBps: body.priceImpactPct == null ? null : Number(body.priceImpactPct) * 10000,
      routeLabels: (body.routePlan || []).map((x) => x.swapInfo && x.swapInfo.label).filter(Boolean),
      contextSlot: body.contextSlot || null
    };
  } catch (error) {
    return { status: "UNKNOWN", source: url, error: String(error) };
  }
}

function decisionAt100(quotes) {
  const q = quotes.find((item) => item.notionalUsd === 100);
  if (!q || q.status !== "VERIFIED" || q.priceImpactBps == null) {
    return { status: "UNKNOWN", reason: "No verified $100 executable quote" };
  }
  return {
    status: q.priceImpactBps <= 50 ? "PASS" : "REFUSE",
    rule: "priceImpactBps <= 50",
    actualBps: q.priceImpactBps
  };
}

async function main() {
  const observedAt = new Date().toISOString();
  const constantsText = await fetchText(ONDO_CONSTANTS);
  const definitions = [
    { underlying: "AAPL", symbol: "AAPLx", family: "xstocks" },
    { underlying: "AAPL", symbol: "AAPLon", family: "ondo" },
    { underlying: "NVDA", symbol: "NVDAx", family: "xstocks" },
    { underlying: "NVDA", symbol: "NVDAon", family: "ondo" }
  ];

  const claims = [];
  for (const definition of definitions) {
    try {
      const identity = definition.family === "xstocks"
        ? await resolveXstock(definition.symbol)
        : resolveOndo(definition.symbol, constantsText);
      const onchain = await inspectMint(identity.mint);
      const quotes = [];
      for (const notionalUsd of NOTIONALS) {
        quotes.push({ notionalUsd, ...(await quote(identity.mint, notionalUsd)) });
      }
      claims.push({
        ...definition,
        status: "VERIFIED",
        identity,
        onchain,
        quotes,
        marketRuleAt100Usd: decisionAt100(quotes)
      });
    } catch (error) {
      claims.push({ ...definition, status: "UNKNOWN", error: String(error) });
    }
  }

  const executableAt100 = claims
    .filter((claim) => claim.marketRuleAt100Usd && claim.marketRuleAt100Usd.status === "PASS")
    .map((claim) => ({
      underlying: claim.underlying,
      symbol: claim.symbol,
      mint: claim.identity.mint,
      priceImpactBps: claim.marketRuleAt100Usd.actualBps,
      routeLabels: (claim.quotes.find((q) => q.notionalUsd === 100) || {}).routeLabels || []
    }))
    .sort((a, b) => a.priceImpactBps - b.priceImpactBps);

  const report = {
    schemaVersion: "covenant.t1-route-reality.v1",
    observedAt,
    status: claims.every((claim) => claim.status === "VERIFIED") ? "PASS" : "PARTIAL",
    policyProbe: {
      notionalUsd: 100,
      maxPriceImpactBps: 50,
      note: "Technical execution probe only. Claim semantics and other Covenant invariants remain separate authorization inputs."
    },
    claims,
    executableAt100
  };
  const envelope = { ...report, reportHash: sha256(report) };
  await mkdir("evidence/t1", { recursive: true });
  const path = "evidence/t1/route-reality-" + observedAt.replace(/[:.]/g, "-") + ".json";
  await writeFile(path, JSON.stringify(envelope, null, 2) + "\n");
  console.log(JSON.stringify(envelope, null, 2));
  console.error("\nCOVENANT T1 ROUTE REALITY: " + report.status);
  console.error("Evidence: " + path);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
