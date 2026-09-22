import { mkdir, writeFile } from "node:fs/promises";
import { buildJupiterExecutionCommitment } from "../src/execution/jupiter-v2.mjs";

const API_BASE =
  process.env.JUPITER_API_BASE || "https://api.jup.ag/swap/v2";
const API_KEY = process.env.JUPITER_API_KEY || "";

const USDC =
  process.env.COVENANT_INPUT_MINT ||
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const AAPLON =
  process.env.COVENANT_OUTPUT_MINT ||
  "123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo";

const TAKER = process.env.COVENANT_TAKER;
const DESTINATION_TOKEN_ACCOUNT =
  process.env.COVENANT_DESTINATION_TOKEN_ACCOUNT || "";
const AMOUNT = process.env.COVENANT_INPUT_AMOUNT || "100000000";
const SLIPPAGE_BPS = process.env.COVENANT_SLIPPAGE_BPS || "50";

if (!TAKER) {
  throw new Error(
    "COVENANT_TAKER is required. Use the Position PDA for the fork/devnet proof; do not use a generic agent wallet.",
  );
}

const params = new URLSearchParams({
  inputMint: USDC,
  outputMint: AAPLON,
  amount: AMOUNT,
  taker: TAKER,
  slippageBps: SLIPPAGE_BPS,
  wrapAndUnwrapSol: "false",
});

if (DESTINATION_TOKEN_ACCOUNT) {
  params.set("destinationTokenAccount", DESTINATION_TOKEN_ACCOUNT);
}

const headers = API_KEY ? { "x-api-key": API_KEY } : {};
const url = API_BASE + "/build?" + params;
const response = await fetch(url, { headers });
const raw = await response.text();

if (!response.ok) {
  throw new Error(
    "Jupiter /build failed (" +
      response.status +
      "). " +
      raw.slice(0, 1000),
  );
}

const build = JSON.parse(raw);
const commitment = buildJupiterExecutionCommitment({
  build,
  expectedInputMint: USDC,
  expectedOutputMint: AAPLON,
  expectedInAmount: AMOUNT,
  expectedTaker: TAKER,
  maxSlippageBps: Number(SLIPPAGE_BPS),
});

const observedAt = new Date().toISOString();
const evidence = {
  schemaVersion: "covenant.t3b-jupiter-build-evidence.v1",
  observedAt,
  environment: {
    apiBase: API_BASE,
    inputMint: USDC,
    outputMint: AAPLON,
    taker: TAKER,
    destinationTokenAccount: DESTINATION_TOKEN_ACCOUNT || null,
    amount: AMOUNT,
  },
  truthBoundary: {
    authorization: "NOT_AUTHORIZED_BY_THIS_SCRIPT",
    signing: "NONE",
    submission: "NONE",
    financialStateChange: "NONE",
    note:
      "This captures an exact Jupiter V2 build commitment. Only a later ALLOW proof and governed program path may authorize execution.",
  },
  commitment,
};

await mkdir("evidence/t3b", { recursive: true });
const path =
  "evidence/t3b/jupiter-build-" +
  observedAt.replace(/[:.]/g, "-") +
  ".json";
await writeFile(path, JSON.stringify(evidence, null, 2) + "\n");

console.log(JSON.stringify(evidence, null, 2));
console.error("\nCOVENANT T3b build commitment: " + path);
