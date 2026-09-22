import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { evaluateTransition, Decision } from "../src/policy/evaluator.mjs";
import {
  buildReceipt,
  buildTransitionProof,
  sha256Canonical,
} from "../src/proof/transition-proof.mjs";
import { buildJupiterExecutionCommitment } from "../src/execution/jupiter-v2.mjs";
import {
  buildApplePythMarketEvidence,
  fetchPythStocklanaEvidence,
  PYTH_STOCKLANA_SYMBOLS,
} from "../src/evidence/pyth-pro.mjs";
import {
  AAPLX,
  JUPITER_PROGRAM,
  OPERATOR_ACQUIRE,
  PROGRAM_ID,
  USDC,
  assertMainnetProgram,
  decodePosition,
  encodeExecuteAppleAcquire,
  explorerTx,
  loadLocalKeypair,
  lookupTables,
  mainnetConnection,
  rawInstruction,
  sendAndConfirmVersioned,
  tokenRawAmount,
} from "../src/execution/mainnet-canary-helpers.mjs";

const CONSENT = "I_UNDERSTAND_THIS_EXECUTES_A_REAL_MAINNET_TRADE";
if (process.env.COVENANT_MAINNET_EXECUTE !== CONSENT) {
  throw new Error(
    "Real mainnet execution is locked. Set COVENANT_MAINNET_EXECUTE=" +
      CONSENT + " only for the final canary.",
  );
}
if (!process.env.PYTH_API_KEY) {
  throw new Error("PYTH_API_KEY is required for real execution");
}

const INPUT_AMOUNT = BigInt(
  process.env.COVENANT_MAINNET_INPUT_AMOUNT || "5000000",
);
const ECONOMIC_VALUE_USD = Number(
  process.env.COVENANT_MAINNET_ECONOMIC_VALUE_USD || "5",
);
const MAX_SLIPPAGE_BPS = Number(
  process.env.COVENANT_MAINNET_SLIPPAGE_BPS || "25",
);
const ABSOLUTE_CAP_RAW = 20_000_000n;
const ABSOLUTE_CAP_USD = 20;
if (INPUT_AMOUNT <= 0n || INPUT_AMOUNT > ABSOLUTE_CAP_RAW) {
  throw new Error("Execution refuses more than $20 USDC");
}
if (
  !Number.isFinite(ECONOMIC_VALUE_USD) ||
  ECONOMIC_VALUE_USD <= 0 ||
  ECONOMIC_VALUE_USD > ABSOLUTE_CAP_USD
) {
  throw new Error("Execution economic value must be >$0 and <=$20");
}

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(name + " is required");
  return value;
};
const position = new PublicKey(required("COVENANT_MAINNET_POSITION"));
const inputTokenAccount = new PublicKey(
  required("COVENANT_MAINNET_INPUT_TOKEN_ACCOUNT"),
);
const outputTokenAccount = new PublicKey(
  required("COVENANT_MAINNET_DESTINATION_TOKEN_ACCOUNT"),
);

const covenant = JSON.parse(
  await readFile("fixtures/apple-mainnet-canary-covenant.json", "utf8"),
);
const passport = JSON.parse(
  await readFile("fixtures/passports/apple-aaplx.json", "utf8"),
);
const connection = mainnetConnection();
const { keypair: operator } = await loadLocalKeypair();
const { genesisHash } = await assertMainnetProgram(connection);

const positionInfoBefore = await connection.getAccountInfo(position, "confirmed");
if (!positionInfoBefore) throw new Error("Configured Position does not exist");
const positionBefore = decodePosition(positionInfoBefore.data);
if (positionBefore.frozen) throw new Error("Position is frozen");
if (positionBefore.evaluator !== operator.publicKey.toBase58()) {
  throw new Error(
    "Local key is not the Position evaluator. Expected " +
      positionBefore.evaluator + ", got " + operator.publicKey.toBase58(),
  );
}
if ((positionBefore.allowedOperatorMask & 1) !== 1) {
  throw new Error("Position does not allow ACQUIRE");
}
if (
  positionBefore.maxTransitionValueUsdMicros <
  BigInt(Math.round(ECONOMIC_VALUE_USD * 1_000_000))
) {
  throw new Error("Position mainnet cap is below requested canary value");
}
const expectedCovenantHash = sha256Canonical(covenant);
if (positionBefore.covenantHash !== expectedCovenantHash) {
  throw new Error(
    "Onchain Position Covenant hash differs from the canary Covenant fixture",
  );
}

const [inputBefore, outputBefore] = await Promise.all([
  tokenRawAmount(connection, inputTokenAccount),
  tokenRawAmount(connection, outputTokenAccount),
]);
if (inputBefore < INPUT_AMOUNT) {
  throw new Error(
    "Position USDC balance is below exact canary input: " + inputBefore,
  );
}

async function fetchJson(url, init = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(
        "HTTP " + response.status + " " + response.statusText + ": " +
          raw.slice(0, 1000),
      );
    }
    return JSON.parse(raw);
  } finally {
    clearTimeout(timer);
  }
}

const JUPITER_QUOTE =
  process.env.JUPITER_QUOTE_URL ||
  "https://lite-api.jup.ag/swap/v1/quote";
const JUPITER_V2 =
  process.env.JUPITER_API_BASE || "https://api.jup.ag/swap/v2";
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || "";

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
    payloadHash: sha256Canonical({ value, source }),
  };
}

const [pythEvidence, quote] = await Promise.all([
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

const evaluation = evaluateTransition({
  covenant,
  passport,
  market,
  portfolioPostState: {},
  authority: {
    allowedOperators: ["ACQUIRE"],
    maxAutonomousTransitionUsd: ABSOLUTE_CAP_USD,
  },
  proposal: {
    positionId: position.toBase58(),
    operator: "ACQUIRE",
    amountUsd: ECONOMIC_VALUE_USD,
  },
  now: new Date(),
});
if (evaluation.decision !== Decision.ALLOW) {
  throw new Error(
    "Live Pyth/Jupiter Covenant did not ALLOW: " +
      JSON.stringify(evaluation.ruleResults),
  );
}

// Re-check the live evidence age immediately before route construction.
const evidenceNow = Date.now();
for (const result of evaluation.ruleResults) {
  if (
    result.observedAt &&
    evidenceNow - Date.parse(result.observedAt) > 20_000
  ) {
    throw new Error("Evidence became stale before route construction");
  }
}

const params = new URLSearchParams({
  inputMint: USDC.toBase58(),
  outputMint: AAPLX.toBase58(),
  amount: INPUT_AMOUNT.toString(),
  taker: position.toBase58(),
  slippageBps: String(MAX_SLIPPAGE_BPS),
  wrapAndUnwrapSol: "false",
  destinationTokenAccount: outputTokenAccount.toBase58(),
});
const headers = JUPITER_API_KEY ? { "x-api-key": JUPITER_API_KEY } : {};
const routeUrl = JUPITER_V2 + "/build?" + params;
const build = await fetchJson(routeUrl, { headers });
if (
  (build.setupInstructions || []).length > 0 ||
  build.cleanupInstruction ||
  (build.otherInstructions || []).length > 0 ||
  build.tipInstruction
) {
  throw new Error(
    "Fail-closed: Jupiter returned unbound setup/cleanup/other/tip instructions",
  );
}
const commitment = buildJupiterExecutionCommitment({
  build,
  expectedInputMint: USDC.toBase58(),
  expectedOutputMint: AAPLX.toBase58(),
  expectedInAmount: INPUT_AMOUNT.toString(),
  expectedTaker: position.toBase58(),
  maxSlippageBps: MAX_SLIPPAGE_BPS,
});

const preState = {
  positionId: position.toBase58(),
  positionVersion: Number(positionBefore.positionVersion),
  nonce: Number(positionBefore.nonce),
  currentClaimMint: positionBefore.currentClaimMint,
  inputUsdcRaw: inputBefore.toString(),
  outputClaimRaw: outputBefore.toString(),
};
const proposedPostState = {
  positionId: position.toBase58(),
  positionVersion: Number(positionBefore.positionVersion + 1n),
  currentClaimMint: AAPLX.toBase58(),
  exactInputRaw: INPUT_AMOUNT.toString(),
  minOutputRaw: commitment.minOut,
};

const evidenceRecords = [
  passport.properties.officialIssuerMappingVerified,
  passport.properties.tokenProgram,
  market.underlyingPriceUsd,
  market.representationPriceUsd,
  market.trackingErrorBps,
  market.pythConfidenceBps,
  market.pythPublisherCount,
  market.pythPayloadSha256,
  market.priceImpactBps,
].map((record) => ({
  ...record,
  payloadHash:
    record.payloadHash ||
    sha256Canonical({
      value: record.value ?? null,
      source: record.source ?? null,
    }),
}));

const expiresAt = new Date(Date.now() + 45_000).toISOString();
const proof = buildTransitionProof({
  evaluation,
  covenant,
  passport,
  evidenceRecords,
  preState,
  proposedPostState,
  authorityRef: {
    kind: "COVENANT_POSITION_PDA_MAINNET_CANARY",
    evaluator: operator.publicKey.toBase58(),
    maxAutonomousTransitionUsd: ABSOLUTE_CAP_USD,
    allowedOperators: ["ACQUIRE"],
    pythSignedPayloadSha256: pythEvidence.signedPayload.sha256,
  },
  executionCommitment: {
    schemaVersion: "covenant.jupiter-cpi-binding.v1",
    onchainExecutionCommitmentHash: commitment.onchainExecutionCommitmentHash,
    swapInvocationHash: commitment.swapInvocationHash,
    inputMint: commitment.inputMint,
    outputMint: commitment.outputMint,
    inAmount: commitment.inAmount,
    minOut: commitment.minOut,
  },
  nonce: Number(positionBefore.nonce),
  expiresAt,
});

const receiptCommitmentHash = sha256Canonical({
  schemaVersion: "covenant.pending-receipt-commitment.v1",
  proofHash: proof.proofHash,
  positionId: position.toBase58(),
  positionVersion: Number(positionBefore.positionVersion),
  nonce: Number(positionBefore.nonce),
});

const proofArgs = {
  covenantHash: proof.covenantHash,
  claimPassportHash: proof.claimPassportHash,
  evidenceRoot: proof.evidenceRoot,
  preStateHash: proof.preStateHash,
  proposedPostStateHash: proof.proposedPostStateHash,
  receiptCommitmentHash,
  executionCommitmentHash: commitment.onchainExecutionCommitmentHash,
  targetClaimMint: AAPLX.toBase58(),
  positionVersion: Number(positionBefore.positionVersion),
  nonce: Number(positionBefore.nonce),
  expiryUnix: Math.floor(Date.parse(expiresAt) / 1000),
  operator: OPERATOR_ACQUIRE,
  economicValueUsdMicros: Math.round(ECONOMIC_VALUE_USD * 1_000_000),
};

const swapAccounts = build.swapInstruction.accounts || [];
for (const account of swapAccounts) {
  if (account.isSigner && account.pubkey !== position.toBase58()) {
    throw new Error(
      "Fail-closed: Jupiter route requires unsupported signer " +
        account.pubkey,
    );
  }
}
const swapAccountFlags = swapAccounts.map(
  (account) =>
    (account.isSigner ? 1 : 0) | (account.isWritable ? 2 : 0),
);
const swapData = Buffer.from(build.swapInstruction.data, "base64");

const executeIx = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: operator.publicKey, isSigner: true, isWritable: false },
    { pubkey: operator.publicKey, isSigner: true, isWritable: false },
    { pubkey: position, isSigner: false, isWritable: true },
    { pubkey: inputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: outputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: JUPITER_PROGRAM, isSigner: false, isWritable: false },
    ...swapAccounts.map((account) => ({
      pubkey: new PublicKey(account.pubkey),
      isSigner:
        Boolean(account.isSigner) &&
        account.pubkey !== position.toBase58(),
      isWritable: Boolean(account.isWritable),
    })),
  ],
  data: encodeExecuteAppleAcquire({
    proof: proofArgs,
    acquire: {
      inputMint: USDC,
      outputMint: AAPLX,
      inputAmount: INPUT_AMOUNT,
      minOut: BigInt(commitment.minOut),
      swapInvocationHash: commitment.swapInvocationHash,
      swapAccountFlags,
      swapData,
    },
  }),
});

const computeBudgetIxs = (build.computeBudgetInstructions || []).map(
  rawInstruction,
);
const alts = await lookupTables(connection, build);

// Final freshness gate. No signature exists if Pyth/Jupiter evidence aged out.
const signingNow = Date.now();
if (
  signingNow - Date.parse(market.trackingErrorBps.observedAt) > 20_000 ||
  signingNow - Date.parse(quote.observedAt) > 20_000
) {
  throw new Error(
    "Pyth or Jupiter evidence aged out before signing; rerun for a fresh proposal",
  );
}

const signature = await sendAndConfirmVersioned({
  connection,
  payer: operator,
  instructions: [...computeBudgetIxs, executeIx],
  lookupTableAccounts: alts,
});

const [inputAfter, outputAfter, positionInfoAfter] = await Promise.all([
  tokenRawAmount(connection, inputTokenAccount),
  tokenRawAmount(connection, outputTokenAccount),
  connection.getAccountInfo(position, "confirmed"),
]);
if (!positionInfoAfter) throw new Error("Position disappeared after execution");
const positionAfter = decodePosition(positionInfoAfter.data);
const spent = inputBefore - inputAfter;
const received = outputAfter - outputBefore;
if (spent !== INPUT_AMOUNT) {
  throw new Error("Postcondition failed: exact USDC spend mismatch");
}
if (received < BigInt(commitment.minOut)) {
  throw new Error("Postcondition failed: AAPLx output below committed minOut");
}
if (positionAfter.currentClaimMint !== AAPLX.toBase58()) {
  throw new Error("Position did not advance to AAPLx");
}
if (
  positionAfter.positionVersion !== positionBefore.positionVersion + 1n ||
  positionAfter.nonce !== positionBefore.nonce + 1n
) {
  throw new Error("Position version/nonce did not advance exactly once");
}
if (positionAfter.lastReceiptHash !== receiptCommitmentHash) {
  throw new Error("Onchain receipt commitment mismatch");
}

// Replay the consumed authorization in a fresh outer transaction. It must fail
// before Jupiter CPI because nonce/version have already advanced.
const replayInputBefore = await tokenRawAmount(connection, inputTokenAccount);
const replayOutputBefore = await tokenRawAmount(connection, outputTokenAccount);
let replayRejected = false;
let replayError = null;
try {
  await sendAndConfirmVersioned({
    connection,
    payer: operator,
    instructions: [...computeBudgetIxs, executeIx],
    lookupTableAccounts: alts,
  });
} catch (error) {
  replayRejected = true;
  replayError = String(error);
}
const replayInputAfter = await tokenRawAmount(connection, inputTokenAccount);
const replayOutputAfter = await tokenRawAmount(connection, outputTokenAccount);
if (!replayRejected) {
  throw new Error("Consumed mainnet authorization replay unexpectedly succeeded");
}
if (
  replayInputBefore !== replayInputAfter ||
  replayOutputBefore !== replayOutputAfter
) {
  throw new Error("Rejected replay changed mainnet balances");
}

const settledState = {
  positionId: position.toBase58(),
  positionVersion: Number(positionAfter.positionVersion),
  nonce: Number(positionAfter.nonce),
  currentClaimMint: positionAfter.currentClaimMint,
  inputUsdcRaw: inputAfter.toString(),
  outputClaimRaw: outputAfter.toString(),
  inputSpentRaw: spent.toString(),
  outputReceivedRaw: received.toString(),
};
const receipt = buildReceipt({
  proof,
  transactionReference: {
    environment: "SOLANA_MAINNET_BETA",
    signature,
    explorer: explorerTx(signature),
  },
  settledState,
  outcome: "EXECUTED",
  observedAt: new Date().toISOString(),
});

const evidence = {
  schemaVersion: "covenant.stocklana-mainnet-canary-execution.v1",
  observedAt: new Date().toISOString(),
  network: {
    genesisHash,
    programId: PROGRAM_ID.toBase58(),
  },
  operator: {
    publicKey: operator.publicKey.toBase58(),
    keypairPath,
  },
  pyth: {
    symbols: pythEvidence.requestedFeeds,
    signedPayloadSha256: pythEvidence.signedPayload.sha256,
    signedPayloadByteLength: pythEvidence.signedPayload.byteLength,
    feeds: pythEvidence.feeds.map(
      ({
        symbol,
        id,
        price,
        confidenceBps,
        publisherCount,
        marketSession,
        observedAt,
      }) => ({
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
  },
  policy: {
    decision: evaluation.decision,
    ruleResults: evaluation.ruleResults,
    proofHash: proof.proofHash,
    evidenceRoot: proof.evidenceRoot,
  },
  route: {
    source: routeUrl,
    inputAmount: commitment.inAmount,
    minOut: commitment.minOut,
    priceImpactPct: commitment.priceImpactPct,
    swapInvocationHash: commitment.swapInvocationHash,
    executionCommitmentHash: commitment.onchainExecutionCommitmentHash,
  },
  execution: {
    signature,
    explorer: explorerTx(signature),
    settledState,
    receipt,
  },
  replay: {
    rejected: true,
    error: replayError,
    balancesUnchanged: true,
  },
  truthBoundary:
    "REAL SOLANA MAINNET EXECUTION. Pyth signed payload bytes are hashed into the proof evidence root and determine policy ALLOW/REFUSE through the evaluator signer. This version does not yet claim independent onchain Pyth VerifyMessage binding inside COVENANT.",
};

await mkdir("evidence/mainnet-canary", { recursive: true });
const path =
  "evidence/mainnet-canary/execution-" +
  new Date().toISOString().replace(/[:.]/g, "-") +
  ".json";
await writeFile(path, JSON.stringify(evidence, null, 2) + "\n");

console.log(JSON.stringify(evidence, null, 2));
console.error("\nMAINNET CANARY: EXECUTED + REPLAY REFUSED");
console.error("Explorer: " + explorerTx(signature));
console.error("Evidence: " + path);
