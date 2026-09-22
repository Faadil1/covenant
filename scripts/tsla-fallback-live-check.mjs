import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Connection, PublicKey } from "@solana/web3.js";
import { getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { evaluateTransition } from "../src/policy/evaluator.mjs";
import { sha256Canonical } from "../src/proof/transition-proof.mjs";
import { parsePythLatestResponse } from "../src/evidence/pyth-pro.mjs";
import { buildTeslaPythJupiterMarketEvidence } from "../src/evidence/tsla-pyth-jupiter.mjs";

const PYTH_API = process.env.PYTH_PRO_API_BASE || "https://pyth-lazer.dourolabs.app";
const PYTH_API_KEY = process.env.PYTH_API_KEY || "";
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || "";
const JUPITER_QUOTE = process.env.JUPITER_QUOTE_URL || "https://api.jup.ag/swap/v1/quote";
const RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

const TSLA = { symbol: "Equity.US.TSLA/USD", id: 1435 };
const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TSLAX = new PublicKey("XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB");
const INPUT_RAW = 5_000_000n;
const INPUT_USD = 5;

if (!PYTH_API_KEY) throw new Error("PYTH_API_KEY is required");
if (!JUPITER_API_KEY) throw new Error("JUPITER_API_KEY is required");

const covenant = JSON.parse(
  await readFile("fixtures/tesla-mainnet-canary-covenant.json", "utf8"),
);
const passport = JSON.parse(
  await readFile("fixtures/passports/tesla-tslax.json", "utf8"),
);

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

const params = new URLSearchParams({
  inputMint: USDC.toBase58(),
  outputMint: TSLAX.toBase58(),
  amount: INPUT_RAW.toString(),
  slippageBps: "25",
  restrictIntermediateTokens: "true",
  instructionVersion: "V2",
});
const quoteUrl = JUPITER_QUOTE + "?" + params;
const quoteBody = JSON.parse(await fetchText(quoteUrl, {
  headers: { "x-api-key": JUPITER_API_KEY },
}));
const quote = {
  ...quoteBody,
  source: quoteUrl,
  observedAt: new Date().toISOString(),
  routeLabels: (quoteBody.routePlan || []).map((x) => x.swapInfo?.label).filter(Boolean),
};

const connection = new Connection(RPC, "confirmed");
const mint = await getMint(connection, TSLAX, "confirmed", TOKEN_2022_PROGRAM_ID);

const market = buildTeslaPythJupiterMarketEvidence({
  pythEvidence: pyth,
  quote,
  inputUsd: INPUT_USD,
  tslaxDecimals: mint.decimals,
});

const evaluation = evaluateTransition({
  covenant,
  passport,
  market,
  portfolioPostState: {},
  authority: {
    allowedOperators: ["ACQUIRE"],
    maxAutonomousTransitionUsd: 20,
  },
  proposal: {
    positionId: "position:tesla:stocklana-fallback",
    operator: "ACQUIRE",
    amountUsd: INPUT_USD,
  },
  now: new Date(),
});

const feed = pyth.feeds[0];
const output = {
  schemaVersion: "covenant.tsla-fallback-live-check.v2",
  observedAt: new Date().toISOString(),
  pyth: {
    symbol: feed.symbol,
    feedId: feed.id,
    priceUsd: feed.price,
    confidenceBps: feed.confidenceBps,
    publisherCount: feed.publisherCount,
    marketSession: feed.marketSession,
    observedAt: feed.observedAt,
    signedPayloadSha256: pyth.signedPayload.sha256,
    signedPayloadByteLength: pyth.signedPayload.byteLength,
  },
  tslax: {
    mint: TSLAX.toBase58(),
    tokenProgram: TOKEN_2022_PROGRAM_ID.toBase58(),
    decimals: mint.decimals,
  },
  jupiter: {
    inputUsd: INPUT_USD,
    inputRaw: INPUT_RAW.toString(),
    outAmountRaw: String(quote.outAmount),
    outputTokens: market.executionQuote.outputTokens,
    impliedExecutionPriceUsd: market.executionQuote.impliedPriceUsd,
    priceImpactPct: String(quote.priceImpactPct ?? "0"),
    priceImpactBps: market.priceImpactBps.value,
    routeLabels: market.executionQuote.routeLabels,
  },
  trackingErrorBps: market.trackingErrorBps.value,
  covenant: {
    id: covenant.id,
    hash: sha256Canonical(covenant),
    decision: evaluation.decision,
    ruleResults: evaluation.ruleResults,
  },
  truthBoundary:
    "LIVE POLICY EVIDENCE, NO EXECUTION. Pyth TSLA is the signed reference and Jupiter USDC->TSLAx is the executable representation price. The real COVENANT evaluator returns ALLOW/ESCALATE/REFUSE. No wallet, signature, program deployment, or financial transaction is used.",
};

await mkdir("evidence/tsla-fallback", { recursive: true });
const path = "evidence/tsla-fallback/live-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
await writeFile(path, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output, null, 2));
console.error("\nTSLA FALLBACK COVENANT: " + evaluation.decision);
console.error("Evidence: " + path);
