import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Connection, PublicKey } from "@solana/web3.js";
import { evaluateTransition, Decision } from "../src/policy/evaluator.mjs";
import { sha256Canonical } from "../src/proof/transition-proof.mjs";
import { buildJupiterExecutionCommitment } from "../src/execution/jupiter-v2.mjs";
import {
  buildApplePythMarketEvidence,
  fetchPythStocklanaEvidence,
  PYTH_STOCKLANA_SYMBOLS,
} from "../src/evidence/pyth-pro.mjs";

const PROGRAM_ID = new PublicKey(
  process.env.COVENANT_PROGRAM_ID ||
    "CEKUNCY7VYeHdwyyWCJTKQkGgMzPeTsx2uwBoQ98wm3z",
);
const USDC = new PublicKey(
  process.env.COVENANT_INPUT_MINT ||
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
);
const AAPLX = new PublicKey(
  process.env.COVENANT_OUTPUT_MINT ||
    "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
);
const MAINNET_RPC =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const JUPITER_V2 =
  process.env.JUPITER_API_BASE || "https://api.jup.ag/swap/v2";
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || "";
const JUPITER_QUOTE =
  process.env.JUPITER_QUOTE_URL || "https://lite-api.jup.ag/swap/v1/quote";

const INPUT_AMOUNT = BigInt(process.env.COVENANT_MAINNET_INPUT_AMOUNT || "5000000");
const ECONOMIC_VALUE_USD = Number(
  process.env.COVENANT_MAINNET_ECONOMIC_VALUE_USD || "5",
);
const MAX_SLIPPAGE_BPS = Number(process.env.COVENANT_MAINNET_SLIPPAGE_BPS || "25");
const ABSOLUTE_CANARY_CAP_USDC_RAW = 20_000_000n; // $20 USDC max.
const ABSOLUTE_CANARY_CAP_USD = 20;

if (INPUT_AMOUNT <= 0n || INPUT_AMOUNT > ABSOLUTE_CANARY_CAP_USDC_RAW) {
  throw new Error(
    "Mainnet canary input must be >0 and <=20,000,000 raw USDC ($20)",
  );
}
if (
  !Number.isFinite(ECONOMIC_VALUE_USD) ||
  ECONOMIC_VALUE_USD <= 0 ||
  ECONOMIC_VALUE_USD > ABSOLUTE_CANARY_CAP_USD
) {
  throw new Error("Mainnet canary economic value must be >$0 and <=$20");
}
if (AAPLX.toBase58() !== "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp") {
  throw new Error("Mainnet canary is hard-locked to exact AAPLx output mint");
}

const covenant = JSON.parse(
  await readFile("fixtures/apple-mainnet-canary-covenant.json", "utf8"),
);
const passport = JSON.parse(
  await readFile("fixtures/passports/apple-aaplx.json", "utf8"),
);

async function fetchJson(url, init = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(
        "HTTP " + response.status + " " + response.statusText + ": " + raw.slice(0, 1000),
      );
    }
    return JSON.parse(raw);
  } finally {
    clearTimeout(timer);
  }
}

async function liveQuote() {
  const params = new URLSearchParams({
    inputMint: USDC.toBase58(),
    outputMint: AAPLX.toBase58(),
    amount: INPUT_AMOUNT.toString(),
    slippageBps: String(MAX_SLIPPAGE_BPS),
    restrictIntermediateTokens: "true",
  });
  const url = JUPITER_QUOTE + "?" + params;
  const body = await fetchJson(url);
  if (!body.outAmount || body.priceImpactPct == null) {
    throw new Error("Jupiter quote omitted outAmount/priceImpactPct");
  }
  return {
    source: url,
    observedAt: new Date().toISOString(),
    outAmount: String(body.outAmount),
    minOut: String(body.otherAmountThreshold || "0"),
    priceImpactPct: String(body.priceImpactPct),
    priceImpactBps: Number(body.priceImpactPct) * 10_000,
    routeLabels: (body.routePlan || [])
      .map((step) => step.swapInfo?.label)
      .filter(Boolean),
  };
}

function marketRecord(value, observedAt, source) {
  return {
    value,
    status: "VERIFIED",
    evidenceClass: "LIVE_MARKET_OR_ORACLE",
    observedAt,
    source,
  };
}

async function optionalJupiterBuild(position, destinationTokenAccount) {
  if (!position || !destinationTokenAccount) return null;
  const params = new URLSearchParams({
    inputMint: USDC.toBase58(),
    outputMint: AAPLX.toBase58(),
    amount: INPUT_AMOUNT.toString(),
    taker: position,
    slippageBps: String(MAX_SLIPPAGE_BPS),
    wrapAndUnwrapSol: "false",
    destinationTokenAccount,
  });
  const headers = JUPITER_API_KEY ? { "x-api-key": JUPITER_API_KEY } : {};
  const url = JUPITER_V2 + "/build?" + params;
  const build = await fetchJson(url, { headers });
  const commitment = buildJupiterExecutionCommitment({
    build,
    expectedInputMint: USDC.toBase58(),
    expectedOutputMint: AAPLX.toBase58(),
    expectedInAmount: INPUT_AMOUNT.toString(),
    expectedTaker: position,
    maxSlippageBps: MAX_SLIPPAGE_BPS,
  });
  return {
    url,
    commitment,
    setupInstructionCount: (build.setupInstructions || []).length,
    cleanupInstructionPresent: Boolean(build.cleanupInstruction),
    otherInstructionCount: (build.otherInstructions || []).length,
    tipInstructionPresent: Boolean(build.tipInstruction),
  };
}

const connection = new Connection(MAINNET_RPC, "confirmed");
const [genesisHash, programAccount, pythEvidence, quote] = await Promise.all([
  connection.getGenesisHash(),
  connection.getAccountInfo(PROGRAM_ID, "confirmed"),
  fetchPythStocklanaEvidence(),
  liveQuote(),
]);

const market = buildApplePythMarketEvidence(
  pythEvidence,
  PYTH_STOCKLANA_SYMBOLS.AAPLX,
);
market.priceImpactBps = marketRecord(
  quote.priceImpactBps,
  quote.observedAt,
  quote.source,
);

const positionAddress = process.env.COVENANT_MAINNET_POSITION || "";
const destinationTokenAccount =
  process.env.COVENANT_MAINNET_DESTINATION_TOKEN_ACCOUNT || "";

let positionExists = false;
if (positionAddress) {
  const info = await connection.getAccountInfo(
    new PublicKey(positionAddress),
    "confirmed",
  );
  positionExists = Boolean(info);
}

const evaluation = evaluateTransition({
  covenant,
  passport,
  market,
  portfolioPostState: {},
  authority: {
    allowedOperators: ["ACQUIRE"],
    maxAutonomousTransitionUsd: ABSOLUTE_CANARY_CAP_USD,
  },
  proposal: {
    positionId:
      positionAddress || "position:apple:stocklana-mainnet-canary:UNINITIALIZED",
    operator: "ACQUIRE",
    amountUsd: ECONOMIC_VALUE_USD,
  },
  now: new Date(),
});

const build = await optionalJupiterBuild(
  positionAddress || null,
  destinationTokenAccount || null,
);

const hardGates = {
  pythPolicyAllow: evaluation.decision === Decision.ALLOW,
  programDeployed: Boolean(programAccount?.executable),
  positionConfigured: Boolean(positionAddress),
  positionExists: positionAddress ? positionExists : false,
  destinationTokenAccountConfigured: Boolean(destinationTokenAccount),
  exactOutputMint: AAPLX.toBase58(),
  canaryCapUsd: ABSOLUTE_CANARY_CAP_USD,
  canaryInputRaw: INPUT_AMOUNT.toString(),
  noSigning: true,
  noSubmission: true,
};

const readyForSigning =
  hardGates.pythPolicyAllow &&
  hardGates.programDeployed &&
  hardGates.positionConfigured &&
  hardGates.positionExists &&
  hardGates.destinationTokenAccountConfigured &&
  Boolean(build) &&
  build.setupInstructionCount === 0 &&
  !build.cleanupInstructionPresent &&
  build.otherInstructionCount === 0 &&
  !build.tipInstructionPresent;

const output = {
  schemaVersion: "covenant.stocklana-mainnet-canary-preflight.v1",
  observedAt: new Date().toISOString(),
  network: {
    rpc: MAINNET_RPC,
    genesisHash,
    programId: PROGRAM_ID.toBase58(),
    programDeployed: hardGates.programDeployed,
  },
  canary: {
    economicValueUsd: ECONOMIC_VALUE_USD,
    inputUsdcRaw: INPUT_AMOUNT.toString(),
    outputMint: AAPLX.toBase58(),
    maxSlippageBps: MAX_SLIPPAGE_BPS,
  },
  pyth: {
    signedPayloadSha256: pythEvidence.signedPayload.sha256,
    signedPayloadByteLength: pythEvidence.signedPayload.byteLength,
    feeds: pythEvidence.feeds.map(
      ({ symbol, id, price, confidenceBps, publisherCount, marketSession, observedAt }) => ({
        symbol,
        id,
        price,
        confidenceBps,
        publisherCount,
        marketSession,
        observedAt,
      }),
    ),
    trackingErrorBps: market.trackingErrorBps.value,
    maxConfidenceBps: market.pythConfidenceBps.value,
  },
  jupiter: {
    quote,
    build,
  },
  covenant: {
    id: covenant.id,
    hash: sha256Canonical(covenant),
    decision: evaluation.decision,
    ruleResults: evaluation.ruleResults,
  },
  hardGates,
  readyForSigning,
  truthBoundary:
    "PREFLIGHT ONLY. This script never loads a wallet secret, signs a transaction, deploys a program, or submits a financial transaction.",
};

await mkdir("evidence/mainnet-canary", { recursive: true });
const path =
  "evidence/mainnet-canary/preflight-" +
  new Date().toISOString().replace(/[:.]/g, "-") +
  ".json";
await writeFile(path, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output, null, 2));
console.error(
  "\nMAINNET CANARY PREFLIGHT: " +
    (readyForSigning ? "READY_FOR_EXPLICIT_SIGNING" : "NOT_READY"),
);
console.error("Evidence: " + path);
