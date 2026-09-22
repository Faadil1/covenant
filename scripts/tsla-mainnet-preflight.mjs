import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Connection, PublicKey } from "@solana/web3.js";
import { evaluateTransition, Decision } from "../src/policy/evaluator.mjs";
import { sha256Canonical } from "../src/proof/transition-proof.mjs";
import { buildJupiterExecutionCommitment } from "../src/execution/jupiter-v2.mjs";
import { parsePythLatestResponse } from "../src/evidence/pyth-pro.mjs";
import { buildTeslaPythJupiterMarketEvidence } from "../src/evidence/tsla-pyth-jupiter.mjs";

const PROGRAM_ID = new PublicKey(
  process.env.COVENANT_PROGRAM_ID || "CEKUNCY7VYeHdwyyWCJTKQkGgMzPeTsx2uwBoQ98wm3z",
);
const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TSLAX = new PublicKey("XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB");
const TSLA = { symbol: "Equity.US.TSLA/USD", id: 1435 };
const RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const PYTH_API = process.env.PYTH_PRO_API_BASE || "https://pyth-lazer.dourolabs.app";
const JUPITER_QUOTE = process.env.JUPITER_QUOTE_URL || "https://api.jup.ag/swap/v1/quote";
const JUPITER_V2 = process.env.JUPITER_API_BASE || "https://api.jup.ag/swap/v2";
const INPUT_RAW = BigInt(process.env.COVENANT_TSLA_MAINNET_INPUT_AMOUNT || "5000000");
const INPUT_USD = Number(process.env.COVENANT_TSLA_MAINNET_ECONOMIC_VALUE_USD || "5");
const SLIPPAGE_BPS = Number(process.env.COVENANT_TSLA_MAINNET_SLIPPAGE_BPS || "25");

if (!process.env.PYTH_API_KEY) throw new Error("PYTH_API_KEY is required");
if (!process.env.JUPITER_API_KEY) throw new Error("JUPITER_API_KEY is required");
if (INPUT_RAW <= 0n || INPUT_RAW > 20_000_000n) throw new Error("TSLA canary must be <= $20 raw USDC");
if (!Number.isFinite(INPUT_USD) || INPUT_USD <= 0 || INPUT_USD > 20) throw new Error("TSLA canary must be <= $20");

const covenant = JSON.parse(await readFile("fixtures/tesla-mainnet-canary-covenant.json", "utf8"));
const passport = JSON.parse(await readFile("fixtures/passports/tesla-tslax.json", "utf8"));

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const raw = await response.text();
  if (!response.ok) throw new Error("HTTP " + response.status + " " + raw.slice(0, 1000));
  return JSON.parse(raw);
}

const pythPayload = await fetchJson(PYTH_API + "/v1/latest_price", {
  method: "POST",
  headers: {
    authorization: "Bearer " + process.env.PYTH_API_KEY,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    priceFeedIds: [TSLA.id],
    properties: ["price","confidence","exponent","publisherCount","marketSession","feedUpdateTimestamp"],
    formats: ["solana"],
    channel: "fixed_rate@200ms",
    ignoreInvalidFeeds: false,
    jsonBinaryEncoding: "base64",
  }),
});
const pyth = parsePythLatestResponse(pythPayload, [TSLA]);

const qp = new URLSearchParams({
  inputMint: USDC.toBase58(),
  outputMint: TSLAX.toBase58(),
  amount: INPUT_RAW.toString(),
  slippageBps: String(SLIPPAGE_BPS),
  restrictIntermediateTokens: "true",
  instructionVersion: "V2",
});
const quoteUrl = JUPITER_QUOTE + "?" + qp;
const quoteBody = await fetchJson(quoteUrl, {
  headers: { "x-api-key": process.env.JUPITER_API_KEY },
});
const quote = {
  ...quoteBody,
  source: quoteUrl,
  observedAt: new Date().toISOString(),
  routeLabels: (quoteBody.routePlan || []).map((x) => x.swapInfo?.label).filter(Boolean),
};
const market = buildTeslaPythJupiterMarketEvidence({
  pythEvidence: pyth,
  quote,
  inputUsd: INPUT_USD,
  tslaxDecimals: 8,
});

const positionAddress = process.env.COVENANT_TSLA_MAINNET_POSITION || "";
const destination = process.env.COVENANT_TSLA_MAINNET_DESTINATION_TOKEN_ACCOUNT || "";

const evaluation = evaluateTransition({
  covenant,
  passport,
  market,
  portfolioPostState: {},
  authority: { allowedOperators: ["ACQUIRE"], maxAutonomousTransitionUsd: 20 },
  proposal: {
    positionId: positionAddress || "position:tesla:stocklana-mainnet:UNINITIALIZED",
    operator: "ACQUIRE",
    amountUsd: INPUT_USD,
  },
  now: new Date(),
});

const connection = new Connection(RPC, "confirmed");
const [genesisHash, programAccount] = await Promise.all([
  connection.getGenesisHash(),
  connection.getAccountInfo(PROGRAM_ID, "confirmed"),
]);
let positionExists = false;
if (positionAddress) {
  positionExists = Boolean(await connection.getAccountInfo(new PublicKey(positionAddress), "confirmed"));
}

let build = null;
if (positionAddress && destination) {
  const bp = new URLSearchParams({
    inputMint: USDC.toBase58(),
    outputMint: TSLAX.toBase58(),
    amount: INPUT_RAW.toString(),
    taker: positionAddress,
    slippageBps: String(SLIPPAGE_BPS),
    wrapAndUnwrapSol: "false",
    destinationTokenAccount: destination,
  });
  const url = JUPITER_V2 + "/build?" + bp;
  const body = await fetchJson(url, {
    headers: { "x-api-key": process.env.JUPITER_API_KEY },
  });
  const commitment = buildJupiterExecutionCommitment({
    build: body,
    expectedInputMint: USDC.toBase58(),
    expectedOutputMint: TSLAX.toBase58(),
    expectedInAmount: INPUT_RAW.toString(),
    expectedTaker: positionAddress,
    maxSlippageBps: SLIPPAGE_BPS,
  });
  build = {
    url,
    commitment,
    setupInstructionCount: (body.setupInstructions || []).length,
    cleanupInstructionPresent: Boolean(body.cleanupInstruction),
    otherInstructionCount: (body.otherInstructions || []).length,
    tipInstructionPresent: Boolean(body.tipInstruction),
  };
}

const hardGates = {
  pythJupiterPolicyAllow: evaluation.decision === Decision.ALLOW,
  mainnetGenesis: genesisHash === "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  programDeployed: Boolean(programAccount?.executable),
  positionConfigured: Boolean(positionAddress),
  positionExists,
  destinationConfigured: Boolean(destination),
  exactOutputMint: TSLAX.toBase58(),
  canaryCapUsd: 20,
  noSigning: true,
  noSubmission: true,
};

const readyForSigning =
  hardGates.pythJupiterPolicyAllow &&
  hardGates.mainnetGenesis &&
  hardGates.programDeployed &&
  hardGates.positionConfigured &&
  hardGates.positionExists &&
  hardGates.destinationConfigured &&
  Boolean(build) &&
  build.setupInstructionCount === 0 &&
  !build.cleanupInstructionPresent &&
  build.otherInstructionCount === 0 &&
  !build.tipInstructionPresent;

const output = {
  schemaVersion: "covenant.tsla-mainnet-preflight.v1",
  observedAt: new Date().toISOString(),
  network: {
    rpc: RPC,
    genesisHash,
    programId: PROGRAM_ID.toBase58(),
    programDeployed: hardGates.programDeployed,
  },
  pyth: {
    feed: TSLA,
    priceUsd: pyth.feeds[0].price,
    confidenceBps: pyth.feeds[0].confidenceBps,
    publisherCount: pyth.feeds[0].publisherCount,
    marketSession: pyth.feeds[0].marketSession,
    signedPayloadSha256: pyth.signedPayload.sha256,
  },
  jupiter: {
    quote: {
      outAmount: String(quote.outAmount),
      priceImpactPct: String(quote.priceImpactPct ?? "0"),
      routeLabels: quote.routeLabels,
      impliedTslaxPriceUsd: market.executionQuote.impliedPriceUsd,
    },
    build,
  },
  covenant: {
    id: covenant.id,
    hash: sha256Canonical(covenant),
    trackingErrorBps: market.trackingErrorBps.value,
    decision: evaluation.decision,
    ruleResults: evaluation.ruleResults,
  },
  hardGates,
  readyForSigning,
  truthBoundary:
    "PREFLIGHT ONLY. Live Pyth TSLA and Jupiter TSLAx data drive the real evaluator. No wallet secret is loaded and no transaction is signed or submitted.",
};

await mkdir("evidence/tsla-fallback", { recursive: true });
const path = "evidence/tsla-fallback/preflight-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
await writeFile(path, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output, null, 2));
console.error("\nTSLA MAINNET PREFLIGHT: " + (readyForSigning ? "READY_FOR_EXPLICIT_SIGNING" : "NOT_READY"));
console.error("Evidence: " + path);
