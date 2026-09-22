import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const PYTH_API_KEY = process.env.PYTH_API_KEY || "";
const PYTH_HERMES =
  process.env.PYTH_HERMES_URL ||
  (PYTH_API_KEY ? "https://pyth.dourolabs.app/hermes" : "https://hermes.pyth.network");
const JUPITER_QUOTE =
  process.env.JUPITER_QUOTE_URL || "https://lite-api.jup.ag/swap/v1/quote";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const FEEDS = {
  AAPL_USD: "49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
  AAPLX_USD: "978e6cc68a119ce066aa830017318563a9ed04ec3a0a6439010fc11296a58675",
  AAPLON_USD: "e6734de88a83d9d2fb33072adab319004700aefd069653aba30ba9e3cac056f2",
  AAPLX_AAPL_RR: "25babb83691a056fd65f879bfd7197eabd840aae741f69c87ccb31e204a979b2",
};

const CLAIMS = [
  {
    id: "apple:xstocks:aaplx",
    symbol: "AAPLx",
    mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    priceFeed: "AAPLX_USD",
  },
  {
    id: "apple:ondo:aaplon",
    symbol: "AAPLon",
    mint: "123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo",
    priceFeed: "AAPLON_USD",
  },
];

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
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function rpc(method, params) {
  const body = await fetchJson(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (body.error) throw new Error(`RPC ${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

function priceValue(p) {
  return Number(p.price) * 10 ** Number(p.expo);
}

async function latestPyth(observedAt) {
  const params = new URLSearchParams();
  for (const id of Object.values(FEEDS)) params.append("ids[]", id);
  params.set("parsed", "true");

  const headers = PYTH_API_KEY
    ? { Authorization: `Bearer ${PYTH_API_KEY}` }
    : {};

  const url = `${PYTH_HERMES}/v2/updates/price/latest?${params}`;
  const body = await fetchJson(url, { headers });
  const observedEpoch = Math.floor(Date.parse(observedAt) / 1000);

  const byId = Object.fromEntries(
    (body.parsed || []).map((item) => [
      item.id.replace(/^0x/, ""),
      {
        price: priceValue(item.price),
        confidence: Number(item.price.conf) * 10 ** Number(item.price.expo),
        publishTime: item.price.publish_time,
        ageSeconds: observedEpoch - item.price.publish_time,
        slot: item.metadata?.slot ?? null,
      },
    ]),
  );

  const result = {};
  for (const [name, id] of Object.entries(FEEDS)) {
    result[name] = byId[id] ?? {
      status: "UNKNOWN",
      reason: "Feed missing from latest-price response",
    };
  }

  return {
    source: url,
    evidenceClass: "LIVE_MARKET_OR_ORACLE",
    observedAt,
    values: result,
  };
}

async function mintNormalization(mint, observedAt) {
  const result = await rpc("getAccountInfo", [
    mint,
    { encoding: "jsonParsed", commitment: "confirmed" },
  ]);

  const info = result?.value?.data?.parsed?.info;
  if (!info) throw new Error(`Could not parse mint: ${mint}`);

  const scaled = (info.extensions || []).find(
    (extension) => extension.extension === "scaledUiAmountConfig",
  )?.state;

  const observedEpoch = Math.floor(Date.parse(observedAt) / 1000);
  const activation = Number(scaled?.newMultiplierEffectiveTimestamp ?? 0);
  const current = scaled?.multiplier == null ? 1 : Number(scaled.multiplier);
  const next = scaled?.newMultiplier == null ? current : Number(scaled.newMultiplier);
  const effectiveMultiplier =
    activation > 0 && observedEpoch >= activation ? next : current;

  return {
    source: RPC_URL,
    evidenceClass: "ONCHAIN_DETERMINISTIC",
    observedAt,
    slot: result.context?.slot ?? null,
    decimals: info.decimals,
    scaledUiAmountConfig: scaled ?? null,
    effectiveMultiplier,
    multiplierSelection:
      activation > 0 && observedEpoch >= activation
        ? "newMultiplier effective at observation time"
        : "current multiplier",
  };
}

async function quote(outputMint, dollars) {
  const params = new URLSearchParams({
    inputMint: USDC,
    outputMint,
    amount: String(dollars * 1_000_000),
    slippageBps: "50",
    restrictIntermediateTokens: "true",
  });
  const url = `${JUPITER_QUOTE}?${params}`;
  const body = await fetchJson(url);
  return {
    source: url,
    inAmount: body.inAmount,
    outAmount: body.outAmount,
    otherAmountThreshold: body.otherAmountThreshold,
    requestedSlippageToleranceBps: 50,
    priceImpactPct: body.priceImpactPct,
    priceImpactBps:
      body.priceImpactPct == null ? null : Number(body.priceImpactPct) * 10_000,
    contextSlot: body.contextSlot ?? null,
    routePlan: body.routePlan ?? [],
  };
}

function normalizeQuote({ quoteRecord, notionalUsd, normalization, referencePrice }) {
  const rawUnits = Number(quoteRecord.outAmount);
  const unscaledTokenAmount = rawUnits / 10 ** normalization.decimals;
  const scaledUiAmount = unscaledTokenAmount * normalization.effectiveMultiplier;
  const impliedPriceUsingScaledUi = notionalUsd / scaledUiAmount;
  const referenceBasisBps =
    referencePrice > 0
      ? Math.abs(impliedPriceUsingScaledUi / referencePrice - 1) * 10_000
      : null;

  return {
    notionalUsd,
    unscaledTokenAmount,
    scaledUiAmount,
    effectiveMultiplier: normalization.effectiveMultiplier,
    impliedPriceUsingScaledUi,
    tokenReferencePriceUsd: referencePrice,
    candidateBasisBpsUsingScaledUi: referenceBasisBps,
    priceImpactBps: quoteRecord.priceImpactBps,
    requestedSlippageToleranceBps: quoteRecord.requestedSlippageToleranceBps,
    minOutRaw: quoteRecord.otherAmountThreshold,
    routeLabels: quoteRecord.routePlan
      .map((step) => step.swapInfo?.label)
      .filter(Boolean),
    semanticsStatus:
      "CANDIDATE_ONLY — scaled UI normalization must remain explicitly bound to issuer/Token-2022 semantics before basis becomes a hard authorization rule",
  };
}

async function main() {
  const observedAt = new Date().toISOString();
  const pyth = await latestPyth(observedAt);
  const claims = [];

  for (const claim of CLAIMS) {
    const normalization = await mintNormalization(claim.mint, observedAt);
    const referencePrice = pyth.values[claim.priceFeed]?.price ?? null;
    const quotes = [];

    for (const notionalUsd of NOTIONALS) {
      const quoteRecord = await quote(claim.mint, notionalUsd);
      quotes.push({
        raw: quoteRecord,
        normalized: normalizeQuote({
          quoteRecord,
          notionalUsd,
          normalization,
          referencePrice,
        }),
      });
    }

    claims.push({
      ...claim,
      normalization,
      quotes,
    });
  }

  const report = {
    schemaVersion: "covenant.t1-live-market-evidence.v1",
    observedAt,
    pyth,
    claims,
    truthNote:
      "Jupiter priceImpactPct, requested slippage tolerance, and Pyth/reference basis are distinct concepts and must remain separate policy fields.",
  };

  const envelope = { ...report, reportHash: sha256(report) };
  await mkdir("evidence/t1", { recursive: true });
  const file = `evidence/t1/market-${observedAt.replace(/[:.]/g, "-")}.json`;
  await writeFile(file, JSON.stringify(envelope, null, 2) + "\n");

  console.log(JSON.stringify(envelope, null, 2));
  console.error(`\nCOVENANT T1 MARKET EVIDENCE: ${file}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
