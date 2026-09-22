import { mkdir, writeFile } from "node:fs/promises";
import { Connection, PublicKey } from "@solana/web3.js";
import { getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { parsePythLatestResponse } from "../src/evidence/pyth-pro.mjs";

const PYTH_API = process.env.PYTH_PRO_API_BASE || "https://pyth-lazer.dourolabs.app";
const PYTH_API_KEY = process.env.PYTH_API_KEY || "";
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || "";
const JUPITER_QUOTE = process.env.JUPITER_QUOTE_URL || "https://api.jup.ag/swap/v1/quote";
const RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

const TSLA = { symbol: "Equity.US.TSLA/USD", id: 1435 };
const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TSLAX = new PublicKey("XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB");
const INPUT_RAW = 5_000_000n;

if (!PYTH_API_KEY) throw new Error("PYTH_API_KEY is required");
if (!JUPITER_API_KEY) throw new Error("JUPITER_API_KEY is required");

async function fetchText(url, init) {
  const response = await fetch(url, init);
  const raw = await response.text();
  if (!response.ok) throw new Error("HTTP " + response.status + " " + raw.slice(0, 800));
  return raw;
}

const pythRaw = await fetchText(PYTH_API + "/v1/latest_price", {
  method: "POST",
  headers: {
    authorization: "Bearer " + PYTH_API_KEY,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    priceFeedIds: [TSLA.id],
    properties: [
      "price",
      "confidence",
      "exponent",
      "publisherCount",
      "marketSession",
      "feedUpdateTimestamp",
    ],
    formats: ["solana"],
    channel: "fixed_rate@200ms",
    ignoreInvalidFeeds: false,
    jsonBinaryEncoding: "base64",
  }),
});
const pyth = parsePythLatestResponse(JSON.parse(pythRaw), [TSLA]);
const tsla = pyth.feeds[0];

const params = new URLSearchParams({
  inputMint: USDC.toBase58(),
  outputMint: TSLAX.toBase58(),
  amount: INPUT_RAW.toString(),
  slippageBps: "25",
  restrictIntermediateTokens: "true",
  instructionVersion: "V2",
});
const quoteUrl = JUPITER_QUOTE + "?" + params;
const quote = JSON.parse(await fetchText(quoteUrl, {
  headers: { "x-api-key": JUPITER_API_KEY },
}));

const connection = new Connection(RPC, "confirmed");
const mint = await getMint(connection, TSLAX, "confirmed", TOKEN_2022_PROGRAM_ID);
const decimals = mint.decimals;
const outputTokens = Number(quote.outAmount) / 10 ** decimals;
if (!Number.isFinite(outputTokens) || outputTokens <= 0) {
  throw new Error("Invalid TSLAx quote output");
}
const inputUsd = Number(INPUT_RAW) / 1_000_000;
const impliedExecutionPriceUsd = inputUsd / outputTokens;
const trackingErrorBps = Math.abs(impliedExecutionPriceUsd - tsla.price) / tsla.price * 10_000;
const priceImpactBps = Number(quote.priceImpactPct || 0) * 10_000;

const output = {
  schemaVersion: "covenant.tsla-fallback-live-check.v1",
  observedAt: new Date().toISOString(),
  pyth: {
    symbol: TSLA.symbol,
    feedId: TSLA.id,
    priceUsd: tsla.price,
    confidenceBps: tsla.confidenceBps,
    publisherCount: tsla.publisherCount,
    marketSession: tsla.marketSession,
    observedAt: tsla.observedAt,
    signedPayloadSha256: pyth.signedPayload.sha256,
    signedPayloadByteLength: pyth.signedPayload.byteLength,
  },
  tslax: {
    mint: TSLAX.toBase58(),
    tokenProgram: TOKEN_2022_PROGRAM_ID.toBase58(),
    decimals,
  },
  jupiter: {
    inputUsd,
    inputRaw: INPUT_RAW.toString(),
    outAmountRaw: String(quote.outAmount),
    outputTokens,
    impliedExecutionPriceUsd,
    priceImpactPct: String(quote.priceImpactPct ?? "0"),
    priceImpactBps,
    routeLabels: (quote.routePlan || []).map((x) => x.swapInfo?.label).filter(Boolean),
  },
  trackingErrorBps,
  candidatePolicy: {
    pythFreshEnoughFor20s: Date.now() - Date.parse(tsla.observedAt) <= 20_000,
    confidenceAtMost50Bps: tsla.confidenceBps <= 50,
    publishersAtLeast1: tsla.publisherCount >= 1,
    routeImpactAtMost50Bps: priceImpactBps <= 50,
    executionTrackingAtMost75Bps: trackingErrorBps <= 75,
  },
  truthBoundary:
    "LIVE DIAGNOSTIC ONLY. Pyth TSLA is the reference; Jupiter USDC->TSLAx quote supplies the executable representation price. No wallet, signature, program deployment, or financial transaction is used.",
};

await mkdir("evidence/tsla-fallback", { recursive: true });
const path = "evidence/tsla-fallback/live-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
await writeFile(path, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output, null, 2));
console.error("\nTSLA FALLBACK LIVE CHECK: COMPLETE");
console.error("Evidence: " + path);
