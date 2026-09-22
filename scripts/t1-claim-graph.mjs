import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const XSTOCKS_API = "https://api.xstocks.fi/api/v2";
const ONDO_CONSTANTS =
  "https://raw.githubusercontent.com/ondoprotocol/gm-solana-simulator/main/constants.rs";
const PYTH_HERMES = process.env.PYTH_HERMES_URL || "https://hermes.pyth.network";
const JUPITER_QUOTE =
  process.env.JUPITER_QUOTE_URL || "https://lite-api.jup.ag/swap/v1/quote";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const EXPECTED_ONDO_AAPL =
  "123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo";
const NOTIONALS = [25, 100, 500];

function sha256(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}

async function fetchJson(url, init = {}, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
    }
    return { body, headers: Object.fromEntries(response.headers), status: response.status };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
    }
    return { text, headers: Object.fromEntries(response.headers), status: response.status };
  } finally {
    clearTimeout(timer);
  }
}

async function rpc(method, params) {
  const { body } = await fetchJson(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (body.error) throw new Error(`RPC ${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

function evidence({ source, evidenceClass, observedAt, payload, status = "VERIFIED" }) {
  return {
    source,
    evidenceClass,
    observedAt,
    status,
    payloadHash: sha256(payload),
    payload,
  };
}

async function resolveXstocksAapl(observedAt) {
  const url = `${XSTOCKS_API}/public/assets/AAPLx`;
  const { body } = await fetchJson(url);
  const deployments = body.deployments || body.tokenDeployments || [];
  const solana = deployments.find((d) => d.network === "Solana");

  if (!solana?.address) {
    throw new Error("Official xStocks API returned no Solana deployment for AAPLx");
  }

  return {
    mint: solana.address,
    record: evidence({
      source: url,
      evidenceClass: "SIGNED_OR_AUTHORITATIVE_OFFCHAIN",
      observedAt,
      payload: {
        id: body.id,
        name: body.name,
        symbol: body.symbol,
        isin: body.isin,
        underlying: body.underlying,
        isTradingHalted: body.isTradingHalted,
        trading: body.trading,
        solanaDeployment: solana,
      },
    }),
  };
}

async function resolveOndoAapl(observedAt) {
  const { text } = await fetchText(ONDO_CONSTANTS);
  const escaped = EXPECTED_ONDO_AAPL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\("AAPLon",\\s*"${escaped}"\\)`);
  if (!pattern.test(text)) {
    throw new Error("Official Ondo repository no longer maps AAPLon to expected Solana mint");
  }

  return {
    mint: EXPECTED_ONDO_AAPL,
    record: evidence({
      source: ONDO_CONSTANTS,
      evidenceClass: "SIGNED_OR_AUTHORITATIVE_OFFCHAIN",
      observedAt,
      payload: {
        symbol: "AAPLon",
        mint: EXPECTED_ONDO_AAPL,
        repository: "ondoprotocol/gm-solana-simulator",
      },
    }),
  };
}

async function inspectMint(mint, observedAt) {
  const result = await rpc("getAccountInfo", [
    mint,
    { encoding: "jsonParsed", commitment: "confirmed" },
  ]);
  if (!result?.value) throw new Error(`Mint account does not exist: ${mint}`);

  return evidence({
    source: RPC_URL,
    evidenceClass: "ONCHAIN_DETERMINISTIC",
    observedAt,
    payload: {
      contextSlot: result.context?.slot ?? null,
      address: mint,
      ownerProgram: result.value.owner,
      executable: result.value.executable,
      lamports: result.value.lamports,
      parsed: result.value.data,
    },
  });
}

async function discoverPyth(query, observedAt) {
  const candidates = [
    `${PYTH_HERMES}/v2/price_feeds?query=${encodeURIComponent(query)}`,
    `${PYTH_HERMES}/v2/price_feeds?query=${encodeURIComponent(query)}&asset_type=equity`,
  ];

  let lastError;
  for (const url of candidates) {
    try {
      const { body } = await fetchJson(url);
      return evidence({
        source: url,
        evidenceClass: "LIVE_MARKET_OR_ORACLE",
        observedAt,
        payload: body,
      });
    } catch (error) {
      lastError = error;
    }
  }
  return evidence({
    source: candidates[0],
    evidenceClass: "LIVE_MARKET_OR_ORACLE",
    observedAt,
    status: "UNKNOWN",
    payload: { error: String(lastError) },
  });
}

async function quote(outputMint, dollars, observedAt) {
  const amount = dollars * 1_000_000;
  const params = new URLSearchParams({
    inputMint: USDC,
    outputMint,
    amount: String(amount),
    slippageBps: "50",
    restrictIntermediateTokens: "true",
  });
  const url = `${JUPITER_QUOTE}?${params}`;

  try {
    const { body } = await fetchJson(url);
    return evidence({
      source: url,
      evidenceClass: "LIVE_MARKET_OR_ORACLE",
      observedAt,
      payload: {
        notionalUsd: dollars,
        inputMint: USDC,
        outputMint,
        inAmount: body.inAmount ?? String(amount),
        outAmount: body.outAmount ?? null,
        otherAmountThreshold: body.otherAmountThreshold ?? null,
        priceImpactPct: body.priceImpactPct ?? null,
        routePlan: body.routePlan ?? null,
        contextSlot: body.contextSlot ?? null,
        timeTaken: body.timeTaken ?? null,
      },
    });
  } catch (error) {
    return evidence({
      source: url,
      evidenceClass: "LIVE_MARKET_OR_ORACLE",
      observedAt,
      status: "UNKNOWN",
      payload: { notionalUsd: dollars, error: String(error) },
    });
  }
}

async function main() {
  const observedAt = new Date().toISOString();
  const failures = [];

  let xstocks;
  let ondo;

  try {
    xstocks = await resolveXstocksAapl(observedAt);
  } catch (error) {
    failures.push({ check: "xstocks_official_resolution", error: String(error) });
  }

  try {
    ondo = await resolveOndoAapl(observedAt);
  } catch (error) {
    failures.push({ check: "ondo_official_resolution", error: String(error) });
  }

  const claims = [];

  for (const candidate of [
    xstocks && { id: "apple:xstocks:aaplx", issuer: "Backed Assets (JE) Limited", ...xstocks },
    ondo && { id: "apple:ondo:aaplon", issuer: "Ondo", ...ondo },
  ].filter(Boolean)) {
    let onchain;
    try {
      onchain = await inspectMint(candidate.mint, observedAt);
    } catch (error) {
      failures.push({ check: `rpc:${candidate.id}`, error: String(error) });
      onchain = evidence({
        source: RPC_URL,
        evidenceClass: "ONCHAIN_DETERMINISTIC",
        observedAt,
        status: "UNKNOWN",
        payload: { address: candidate.mint, error: String(error) },
      });
    }

    const quotes = await Promise.all(
      NOTIONALS.map((dollars) => quote(candidate.mint, dollars, observedAt)),
    );

    claims.push({
      id: candidate.id,
      underlying: "AAPL",
      network: "Solana",
      mint: candidate.mint,
      issuer: candidate.issuer,
      identityEvidence: candidate.record,
      onchainEvidence: onchain,
      marketEvidence: quotes,
    });
  }

  const pyth = {
    AAPL: await discoverPyth("AAPL", observedAt),
    AAPLX: await discoverPyth("AAPLX", observedAt),
  };

  const exactDistinctMints =
    claims.length >= 2 && new Set(claims.map((claim) => claim.mint)).size >= 2;
  const onchainExistence =
    claims.length >= 2 &&
    claims.every((claim) => claim.onchainEvidence.status === "VERIFIED");
  const officialIdentity =
    claims.length >= 2 &&
    claims.every((claim) => claim.identityEvidence.status === "VERIFIED");

  const status =
    exactDistinctMints && onchainExistence && officialIdentity
      ? "PASS"
      : "FAIL_CLOSED";

  const report = {
    schemaVersion: "covenant.t1-claim-graph.v1",
    observedAt,
    underlying: "APPLE",
    status,
    passConditions: {
      exactDistinctMints,
      onchainExistence,
      officialIdentity,
      liveRouteEvidence: claims.map((claim) => ({
        claimId: claim.id,
        availableNotionals: claim.marketEvidence
          .filter((record) => record.status === "VERIFIED" && record.payload.outAmount)
          .map((record) => record.payload.notionalUsd),
      })),
    },
    claims,
    pyth,
    failures,
  };

  const envelope = {
    ...report,
    reportHash: sha256(report),
  };

  await mkdir("evidence/t1", { recursive: true });
  const file = `evidence/t1/runtime-${observedAt.replace(/[:.]/g, "-")}.json`;
  await writeFile(file, JSON.stringify(envelope, null, 2) + "\n");

  console.log(JSON.stringify(envelope, null, 2));
  console.error(`\nCOVENANT T1: ${status}`);
  console.error(`Evidence: ${file}`);

  if (status !== "PASS") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
