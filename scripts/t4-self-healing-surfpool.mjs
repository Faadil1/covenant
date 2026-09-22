import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Surfnet } from "@solana/surfpool";
import {
  AddressLookupTableAccount,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { evaluateTransition, Decision } from "../src/policy/evaluator.mjs";
import { planRepresentationRepair } from "../src/runtime/repair-planner.mjs";
import {
  buildTransitionProof,
  buildReceipt,
  sha256Canonical,
} from "../src/proof/transition-proof.mjs";
import { buildJupiterExecutionCommitment } from "../src/execution/jupiter-v2.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PROGRESS_PATH = resolve(ROOT, "evidence/t4/surfpool-execution-progress.json");

async function markStage(stage, detail = {}) {
  await mkdir(resolve(ROOT, "evidence/t4"), { recursive: true });
  const payload = {
    schemaVersion: "covenant.t4-self-healing-progress.v1",
    observedAt: new Date().toISOString(),
    stage,
    detail,
  };
  await writeFile(PROGRESS_PATH, JSON.stringify(payload, null, 2) + "\n");
  console.error("[COVENANT T4] " + stage + " " + JSON.stringify(detail));
}

const PROGRAM_ID = new PublicKey("CEKUNCY7VYeHdwyyWCJTKQkGgMzPeTsx2uwBoQ98wm3z");
const JUPITER_PROGRAM = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const AAPLX = new PublicKey("XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp");
const AAPLON = new PublicKey("123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo");
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

const SOURCE_AMOUNT = BigInt(process.env.COVENANT_SOURCE_AMOUNT || "3000000");
const ECONOMIC_VALUE_USD = Number(process.env.COVENANT_ECONOMIC_VALUE_USD || "10");
const MAX_SLIPPAGE_BPS = Number(process.env.COVENANT_SLIPPAGE_BPS || "50");
const MAINNET_RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const JUPITER_V2 = process.env.JUPITER_API_BASE || "https://api.jup.ag/swap/v2";
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || "";
const JUPITER_QUOTE = process.env.JUPITER_QUOTE_URL || "https://lite-api.jup.ag/swap/v1/quote";

const OPERATOR_MIGRATE = 1;
const MIGRATE_MASK = 1 << OPERATOR_MIGRATE;

const covenant = JSON.parse(
  await readFile(resolve(ROOT, "fixtures/apple-self-healing-covenant.json"), "utf8"),
);
const aaplxPassport = JSON.parse(
  await readFile(resolve(ROOT, "fixtures/passports/apple-aaplx.json"), "utf8"),
);
const aaplonPassport = JSON.parse(
  await readFile(resolve(ROOT, "fixtures/passports/apple-aaplon.json"), "utf8"),
);

function hashBytes(value) {
  return createHash("sha256").update(value).digest();
}
function anchorDiscriminator(name) {
  return hashBytes(Buffer.from("global:" + name)).subarray(0, 8);
}
function fromHex32(value, field) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error(field + " must be a 32-byte hex digest");
  }
  return Buffer.from(value, "hex");
}
function u16(value) {
  const out = Buffer.alloc(2);
  out.writeUInt16LE(Number(value));
  return out;
}
function u32(value) {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(Number(value));
  return out;
}
function u64(value) {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(BigInt(value));
  return out;
}
function i64(value) {
  const out = Buffer.alloc(8);
  out.writeBigInt64LE(BigInt(value));
  return out;
}
function vecBytes(value) {
  const bytes = Buffer.from(value);
  return Buffer.concat([u32(bytes.length), bytes]);
}
function encodeInitialize({ positionId, covenantHash, evaluator, maxUsdMicros, operatorMask }) {
  return Buffer.concat([
    anchorDiscriminator("initialize_position"),
    Buffer.from(positionId),
    Buffer.from(covenantHash),
    evaluator.toBuffer(),
    u64(maxUsdMicros),
    u16(operatorMask),
  ]);
}
function encodeAdoptExistingClaim(claimMint) {
  return Buffer.concat([
    anchorDiscriminator("adopt_existing_claim"),
    claimMint.toBuffer(),
  ]);
}

function encodeProofArgs(proof) {
  return Buffer.concat([
    fromHex32(proof.covenantHash, "covenantHash"),
    fromHex32(proof.claimPassportHash, "claimPassportHash"),
    fromHex32(proof.evidenceRoot, "evidenceRoot"),
    fromHex32(proof.preStateHash, "preStateHash"),
    fromHex32(proof.proposedPostStateHash, "proposedPostStateHash"),
    fromHex32(proof.receiptCommitmentHash, "receiptCommitmentHash"),
    fromHex32(proof.executionCommitmentHash, "executionCommitmentHash"),
    new PublicKey(proof.targetClaimMint).toBuffer(),
    u64(proof.positionVersion),
    u64(proof.nonce),
    i64(proof.expiryUnix),
    Buffer.from([proof.operator]),
    u64(proof.economicValueUsdMicros),
  ]);
}

function encodeAuthorizeTransition(proof) {
  return Buffer.concat([
    anchorDiscriminator("authorize_transition"),
    encodeProofArgs(proof),
  ]);
}

function encodeExecuteAuthorizedClaimMigrate({ migrate }) {
  return Buffer.concat([
    anchorDiscriminator("execute_authorized_claim_migrate"),
    migrate.inputMint.toBuffer(),
    migrate.outputMint.toBuffer(),
    u64(migrate.inputAmount),
    u64(migrate.minOut),
    fromHex32(migrate.swapInvocationHash, "swapInvocationHash"),
    vecBytes(migrate.swapAccountFlagsPacked),
    vecBytes(migrate.swapData),
  ]);
}

function packSwapAccountFlags(accounts) {
  const packed = Buffer.alloc(Math.ceil(accounts.length / 4));
  accounts.forEach((account, index) => {
    const flags =
      (account.isSigner ? 1 : 0) |
      (account.isWritable ? 2 : 0);
    packed[Math.floor(index / 4)] |= flags << ((index % 4) * 2);
  });
  return packed;
}

function encodeExecuteClaimMigrate({ proof, migrate }) {
  const flags = Buffer.from(migrate.swapAccountFlags);
  return Buffer.concat([
    anchorDiscriminator("execute_claim_migrate"),
    fromHex32(proof.covenantHash, "covenantHash"),
    fromHex32(proof.claimPassportHash, "claimPassportHash"),
    fromHex32(proof.evidenceRoot, "evidenceRoot"),
    fromHex32(proof.preStateHash, "preStateHash"),
    fromHex32(proof.proposedPostStateHash, "proposedPostStateHash"),
    fromHex32(proof.receiptCommitmentHash, "receiptCommitmentHash"),
    fromHex32(proof.executionCommitmentHash, "executionCommitmentHash"),
    new PublicKey(proof.targetClaimMint).toBuffer(),
    u64(proof.positionVersion),
    u64(proof.nonce),
    i64(proof.expiryUnix),
    Buffer.from([proof.operator]),
    u64(proof.economicValueUsdMicros),
    migrate.inputMint.toBuffer(),
    migrate.outputMint.toBuffer(),
    u64(migrate.inputAmount),
    u64(migrate.minOut),
    fromHex32(migrate.swapInvocationHash, "swapInvocationHash"),
    vecBytes(flags),
    vecBytes(migrate.swapData),
  ]);
}

function encodeExecuteAppleAcquire({ proof, acquire }) {
  const flags = Buffer.from(acquire.swapAccountFlags);
  return Buffer.concat([
    anchorDiscriminator("execute_apple_acquire"),
    fromHex32(proof.covenantHash, "covenantHash"),
    fromHex32(proof.claimPassportHash, "claimPassportHash"),
    fromHex32(proof.evidenceRoot, "evidenceRoot"),
    fromHex32(proof.preStateHash, "preStateHash"),
    fromHex32(proof.proposedPostStateHash, "proposedPostStateHash"),
    fromHex32(proof.receiptCommitmentHash, "receiptCommitmentHash"),
    fromHex32(proof.executionCommitmentHash, "executionCommitmentHash"),
    new PublicKey(proof.targetClaimMint).toBuffer(),
    u64(proof.positionVersion),
    u64(proof.nonce),
    i64(proof.expiryUnix),
    Buffer.from([proof.operator]),
    u64(proof.economicValueUsdMicros),
    acquire.inputMint.toBuffer(),
    acquire.outputMint.toBuffer(),
    u64(acquire.inputAmount),
    u64(acquire.minOut),
    fromHex32(acquire.swapInvocationHash, "swapInvocationHash"),
    vecBytes(flags),
    vecBytes(acquire.swapData),
  ]);
}

function decodePosition(data) {
  if (!data || data.length < 229) throw new Error("Position account data too short");
  let offset = 8;
  const take = (n) => {
    const out = data.subarray(offset, offset + n);
    offset += n;
    return out;
  };
  const positionId = take(32);
  const owner = new PublicKey(take(32));
  const evaluator = new PublicKey(take(32));
  const covenantHash = take(32).toString("hex");
  const positionVersion = data.readBigUInt64LE(offset); offset += 8;
  const nonce = data.readBigUInt64LE(offset); offset += 8;
  const maxTransitionValueUsdMicros = data.readBigUInt64LE(offset); offset += 8;
  const allowedOperatorMask = data.readUInt16LE(offset); offset += 2;
  const frozen = Boolean(data[offset]); offset += 1;
  const currentClaimMint = new PublicKey(take(32));
  const lastReceiptHash = take(32).toString("hex");
  const bump = data[offset++];
  const vaultBump = data[offset++];
  return {
    positionId: positionId.toString("hex"),
    owner: owner.toBase58(),
    evaluator: evaluator.toBase58(),
    covenantHash,
    positionVersion,
    nonce,
    maxTransitionValueUsdMicros,
    allowedOperatorMask,
    frozen,
    currentClaimMint: currentClaimMint.equals(PublicKey.default)
      ? null
      : currentClaimMint.toBase58(),
    lastReceiptHash,
    bump,
    vaultBump,
  };
}

async function fetchText(url, init = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      throw new Error("HTTP " + response.status + " " + response.statusText + ": " + text.slice(0, 1200));
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}
async function fetchJson(url, init = {}, timeoutMs = 20_000) {
  return JSON.parse(await fetchText(url, init, timeoutMs));
}

async function liveQuote({ inputMint, outputMint, amount }) {
  const params = new URLSearchParams({
    inputMint: inputMint.toBase58(),
    outputMint: outputMint.toBase58(),
    amount: amount.toString(),
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
    inAmount: String(body.inAmount || amount),
    outAmount: String(body.outAmount),
    minOut: String(body.otherAmountThreshold || "0"),
    priceImpactPct: String(body.priceImpactPct),
    priceImpactBps: Number(body.priceImpactPct) * 10_000,
    routeLabels: (body.routePlan || []).map((step) => step.swapInfo?.label).filter(Boolean),
    contextSlot: body.contextSlot ?? null,
  };
}

async function buildJupiterRoute({
  inputMint,
  outputMint,
  amount,
  taker,
  payer,
  destinationTokenAccount,
}) {
  const params = new URLSearchParams({
    inputMint: inputMint.toBase58(),
    outputMint: outputMint.toBase58(),
    amount: amount.toString(),
    taker: taker.toBase58(),
    payer: payer.toBase58(),
    slippageBps: String(MAX_SLIPPAGE_BPS),
    wrapAndUnwrapSol: "false",
    destinationTokenAccount: destinationTokenAccount.toBase58(),
  });
  const headers = JUPITER_API_KEY ? { "x-api-key": JUPITER_API_KEY } : {};
  const url = JUPITER_V2 + "/build?" + params;
  const build = await fetchJson(url, { headers });

  const omittedSetupInstructions = build.setupInstructions || [];
  if (build.cleanupInstruction || (build.otherInstructions || []).length > 0 || build.tipInstruction) {
    throw new Error("T4 fail-closed: Jupiter returned unbound cleanup/other/tip instruction material");
  }

  const commitment = buildJupiterExecutionCommitment({
    build,
    expectedInputMint: inputMint.toBase58(),
    expectedOutputMint: outputMint.toBase58(),
    expectedInAmount: amount.toString(),
    expectedTaker: taker.toBase58(),
    maxSlippageBps: MAX_SLIPPAGE_BPS,
  });
  return { url, build, commitment, omittedSetupInstructions };
}

function evidenceRecord(value, evidenceClass, observedAt, source) {
  return {
    value,
    status: "VERIFIED",
    evidenceClass,
    observedAt,
    source,
    payloadHash: sha256Canonical({ value, source }),
  };
}
function withPayloadHash(record) {
  return {
    ...record,
    payloadHash:
      record.payloadHash ||
      sha256Canonical({ value: record.value ?? null, source: record.source ?? null }),
  };
}

function evaluateClaim({
  passport,
  quote,
  now,
  operator = "MIGRATE",
  amountUsd = ECONOMIC_VALUE_USD,
}) {
  const market = {
    priceImpactBps: evidenceRecord(
      quote.priceImpactBps,
      "LIVE_MARKET_OR_ORACLE",
      quote.observedAt,
      quote.source,
    ),
  };
  const authority = {
    allowedOperators: ["MIGRATE", "FREEZE"],
    maxAutonomousTransitionUsd: 100,
  };
  const proposal = {
    positionId: "position:apple:self-healing",
    operator,
    amountUsd,
  };
  const evaluation = evaluateTransition({
    covenant,
    passport,
    market,
    portfolioPostState: {},
    authority,
    proposal,
    now,
  });
  return { evaluation, market, authority, proposal };
}

async function tokenAmount(connection, account) {
  const balance = await connection.getTokenAccountBalance(account, "confirmed");
  return BigInt(balance.value.amount);
}

function rawInstruction(ix) {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: (ix.accounts || []).map((account) => ({
      pubkey: new PublicKey(account.pubkey),
      isSigner: Boolean(account.isSigner),
      isWritable: Boolean(account.isWritable),
    })),
    data: Buffer.from(ix.data, "base64"),
  });
}

async function lookupTables(connection, build) {
  const addresses = Object.keys(build.addressesByLookupTableAddress || {});
  const tables = [];
  for (const address of addresses) {
    const key = new PublicKey(address);
    const fetched = await connection.getAddressLookupTable(key, { commitment: "confirmed" });
    if (!fetched.value) {
      const listed = build.addressesByLookupTableAddress[address] || [];
      tables.push(
        new AddressLookupTableAccount({
          key,
          state: {
            deactivationSlot: BigInt("18446744073709551615"),
            lastExtendedSlot: 0,
            lastExtendedSlotStartIndex: 0,
            authority: undefined,
            addresses: listed.map((item) => new PublicKey(item)),
          },
        }),
      );
    } else {
      tables.push(fetched.value);
    }
  }
  return tables;
}

async function sendVersioned({ connection, payer, signers, instructions, lookupTableAccounts }) {
  const latest = await connection.getLatestBlockhash("processed");
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: latest.blockhash,
    instructions,
  }).compileToV0Message(lookupTableAccounts);
  const transaction = new VersionedTransaction(message);
  transaction.sign([payer, ...signers]);

  const signature = await connection.sendTransaction(transaction, {
    skipPreflight: false,
    preflightCommitment: "processed",
    maxRetries: 0,
  });

  // Surfpool's embedded JS runtime exposes HTTP RPC reliably but may not expose
  // the companion websocket endpoint expected by web3.js confirmTransaction().
  // Poll signature status over HTTP so fork proof success is determined by
  // transaction state, not by an unavailable websocket transport.
  const deadline = Date.now() + 15_000;
  let lastStatus = null;
  while (Date.now() < deadline) {
    const statuses = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const status = statuses.value[0];
    if (status) {
      lastStatus = status;
      if (status.err) {
        throw new Error(
          "Transaction failed: " + JSON.stringify(status.err) +
            " signature=" + signature,
        );
      }
      if (
        status.confirmationStatus === "confirmed" ||
        status.confirmationStatus === "finalized" ||
        (status.confirmations !== null && status.confirmations >= 1)
      ) {
        return signature;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Some local/fork runtimes do not advance confirmation levels like mainnet.
  // A retrievable transaction with no meta error is still deterministic proof
  // that the state transition executed in this fork.
  const landed = await connection.getTransaction(signature, {
    commitment: "processed",
    maxSupportedTransactionVersion: 0,
  });
  if (landed?.meta?.err) {
    throw new Error(
      "Transaction landed with error: " +
        JSON.stringify(landed.meta.err) +
        " signature=" + signature,
    );
  }
  if (landed) return signature;

  throw new Error(
    "Surfpool transaction status timeout: signature=" + signature +
      " lastStatus=" + JSON.stringify(lastStatus),
  );
}

const SAFE_SETUP_PROGRAMS = new Set([
  SystemProgram.programId.toBase58(),
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  TOKEN_PROGRAM.toBase58(),
  TOKEN_2022_PROGRAM.toBase58(),
]);

function validateSetupInstructions(ixs) {
  return (ixs || []).map((ix, index) => {
    if (!SAFE_SETUP_PROGRAMS.has(ix.programId)) {
      throw new Error(
        "T4 fail-closed: Jupiter setup instruction uses unapproved program " +
          ix.programId + " at index " + index,
      );
    }
    return {
      index,
      programId: ix.programId,
      accountCount: (ix.accounts || []).length,
      dataLength: Buffer.from(ix.data || "", "base64").length,
    };
  });
}

async function main() {
  const runObservedAt = new Date().toISOString();
  await markStage("HARNESS_START", { mainnetRpc: MAINNET_RPC });
  const payerInfo = Surfnet.newKeypair();
  const surfnet = Surfnet.startWithConfig({
    remoteRpcUrl: MAINNET_RPC,
    blockProductionMode: "transaction",
    slotTimeMs: 1,
    payerSecretKey: payerInfo.secretKey,
    airdropSol: 20_000_000_000,
    skipBlockhashCheck: true,
  });
  await markStage("SURFNET_READY", { rpcUrl: surfnet.rpcUrl });

  try {
    const connection = new Connection(surfnet.rpcUrl, "confirmed");
    const owner = Keypair.fromSecretKey(Uint8Array.from(payerInfo.secretKey));
    const evaluator = Keypair.generate();
    const proposer = Keypair.generate();

    surfnet.fundSol(evaluator.publicKey.toBase58(), 2_000_000_000);
    surfnet.fundSol(proposer.publicKey.toBase58(), 2_000_000_000);

    const deployed = surfnet.deploy({
      programId: PROGRAM_ID.toBase58(),
      soPath: resolve(ROOT, "anchor/target/deploy/covenant_runtime.so"),
      idlPath: resolve(ROOT, "anchor/target/idl/covenant_runtime.json"),
    });
    if (deployed !== PROGRAM_ID.toBase58()) {
      throw new Error("Surfpool deployed unexpected program id: " + deployed);
    }
    await markStage("PROGRAM_DEPLOYED", { programId: deployed });

    const positionId = hashBytes(Buffer.from("COVENANT:APPLE:SELF-HEALING:POSITION:01"));
    const covenantHashHex = sha256Canonical(covenant);
    const [position] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), owner.publicKey.toBuffer(), positionId],
      PROGRAM_ID,
    );

    const initialize = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: owner.publicKey, isSigner: true, isWritable: true },
        { pubkey: position, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInitialize({
        positionId,
        covenantHash: Buffer.from(covenantHashHex, "hex"),
        evaluator: evaluator.publicKey,
        maxUsdMicros: BigInt(Math.round(100 * 1_000_000)),
        operatorMask: MIGRATE_MASK,
      }),
    });
    const initializeSignature = await sendVersioned({
      connection,
      payer: owner,
      signers: [],
      instructions: [initialize],
      lookupTableAccounts: [],
    });

    const token2022 = TOKEN_2022_PROGRAM.toBase58();
    surfnet.fundToken(position.toBase58(), AAPLX.toBase58(), Number(SOURCE_AMOUNT), token2022);
    surfnet.fundToken(position.toBase58(), AAPLON.toBase58(), 1, token2022);
    surfnet.setTokenBalance(position.toBase58(), AAPLON.toBase58(), 0, token2022);

    const sourceTokenAccount = new PublicKey(
      surfnet.getAta(position.toBase58(), AAPLX.toBase58(), token2022),
    );
    const targetTokenAccount = new PublicKey(
      surfnet.getAta(position.toBase58(), AAPLON.toBase58(), token2022),
    );

    const adoptIx = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: owner.publicKey, isSigner: true, isWritable: false },
        { pubkey: position, isSigner: false, isWritable: true },
        { pubkey: sourceTokenAccount, isSigner: false, isWritable: false },
      ],
      data: encodeAdoptExistingClaim(AAPLX),
    });
    const adoptSignature = await sendVersioned({
      connection,
      payer: owner,
      signers: [],
      instructions: [adoptIx],
      lookupTableAccounts: [],
    });

    const positionInfo = await connection.getAccountInfo(position, "confirmed");
    if (!positionInfo) throw new Error("Position missing after bootstrap");
    const positionBefore = decodePosition(positionInfo.data);
    if (positionBefore.currentClaimMint !== AAPLX.toBase58()) {
      throw new Error("Bootstrap did not bind current claim to AAPLx");
    }
    if (positionBefore.covenantHash !== covenantHashHex) {
      throw new Error("Onchain Covenant hash differs from self-healing fixture");
    }

    await markStage("CURRENT_CLAIM_ADOPTED", {
      claim: AAPLX.toBase58(),
      sourceAmountRaw: SOURCE_AMOUNT.toString(),
      signature: adoptSignature,
      positionVersion: Number(positionBefore.positionVersion),
      nonce: Number(positionBefore.nonce),
    });

    const [currentRouteQuote, migrationQuote] = await Promise.all([
      liveQuote({
        inputMint: USDC,
        outputMint: AAPLX,
        amount: BigInt(Math.round(ECONOMIC_VALUE_USD * 1_000_000)),
      }),
      liveQuote({
        inputMint: AAPLX,
        outputMint: AAPLON,
        amount: SOURCE_AMOUNT,
      }),
    ]);

    const now = new Date().toISOString();
    const current = evaluateClaim({
      passport: aaplxPassport,
      quote: currentRouteQuote,
      now,
    });
    if (current.evaluation.decision !== Decision.REFUSE) {
      throw new Error(
        "Current AAPLx must fail closed under the rights-sensitive Covenant: " +
        JSON.stringify(current.evaluation.ruleResults),
      );
    }

    const target = evaluateClaim({
      passport: aaplonPassport,
      quote: migrationQuote,
      now,
    });
    if (target.evaluation.decision !== Decision.ALLOW) {
      throw new Error(
        "AAPLon repair target did not ALLOW: " +
        JSON.stringify(target.evaluation.ruleResults),
      );
    }

    const repairPlan = planRepresentationRepair({
      currentClaimId: aaplxPassport.id,
      evaluations: [
        {
          claimId: aaplxPassport.id,
          decision: current.evaluation.decision,
          ruleResults: current.evaluation.ruleResults,
        },
        {
          claimId: aaplonPassport.id,
          decision: target.evaluation.decision,
          ruleResults: target.evaluation.ruleResults,
        },
      ],
      authority: target.authority,
      candidatePriority: [aaplonPassport.id],
    });
    if (repairPlan.outcome !== "MIGRATE" || repairPlan.toClaimId !== aaplonPassport.id) {
      throw new Error("Repair planner did not select exact AAPLon migration: " + JSON.stringify(repairPlan));
    }
    await markStage("REPAIR_PLANNED", {
      from: repairPlan.fromClaimId,
      to: repairPlan.toClaimId,
      currentReasonCodes: repairPlan.sourceFailure?.reasonCodes || [],
      migrationPriceImpactBps: migrationQuote.priceImpactBps,
    });

    const route = await buildJupiterRoute({
      inputMint: AAPLX,
      outputMint: AAPLON,
      amount: SOURCE_AMOUNT,
      taker: position,
      payer: owner.publicKey,
      destinationTokenAccount: targetTokenAccount,
    });
    const { build, commitment } = route;

    // Multi-hop Jupiter routes can require intermediate token accounts that do
    // not exist in the fork. Unlike the T3b single-path proof, those setup
    // instructions are not always redundant. We allow only account-setup
    // programs and execute them with NO Position PDA signature, then prove that
    // source/target economic balances did not change.
    const setupSummary = validateSetupInstructions(route.omittedSetupInstructions);
    for (const [index, ix] of route.omittedSetupInstructions.entries()) {
      if ((ix.accounts || []).some(
        (account) => account.isSigner && account.pubkey === position.toBase58(),
      )) {
        throw new Error(
          "T4 fail-closed: setup instruction " + index +
            " requests Position PDA signature",
        );
      }
    }

    const sourceBeforeSetup = await tokenAmount(connection, sourceTokenAccount);
    const targetBeforeSetup = await tokenAmount(connection, targetTokenAccount);
    const setupSignatures = [];
    if (route.omittedSetupInstructions.length > 0) {
      for (const ix of route.omittedSetupInstructions) {
        setupSignatures.push(
          await sendVersioned({
            connection,
            payer: owner,
            signers: [],
            instructions: [rawInstruction(ix)],
            lookupTableAccounts: [],
          }),
        );
      }
    }
    const sourceAfterSetup = await tokenAmount(connection, sourceTokenAccount);
    const targetAfterSetup = await tokenAmount(connection, targetTokenAccount);
    if (
      sourceAfterSetup !== sourceBeforeSetup ||
      targetAfterSetup !== targetBeforeSetup
    ) {
      throw new Error(
        "T4 fail-closed: route setup changed economic source/target balances",
      );
    }
    await markStage("SAFE_ROUTE_SETUP_READY", {
      instructionCount: setupSummary.length,
      instructions: setupSummary,
      signatures: setupSignatures,
      sourceTargetBalancesUnchanged: true,
    });

    const sourceBefore = sourceAfterSetup;
    const targetBefore = targetAfterSetup;
    if (sourceBefore !== SOURCE_AMOUNT) {
      throw new Error("Self-healing fixture source balance changed before authorization");
    }

    const preState = {
      positionId: position.toBase58(),
      positionVersion: Number(positionBefore.positionVersion),
      nonce: Number(positionBefore.nonce),
      currentClaimMint: positionBefore.currentClaimMint,
      sourceClaimRaw: sourceBefore.toString(),
      targetClaimRaw: targetBefore.toString(),
    };
    const proposedPostState = {
      positionId: position.toBase58(),
      positionVersion: Number(positionBefore.positionVersion + 1n),
      currentClaimMint: AAPLON.toBase58(),
      sourceClaimRaw: "0",
      minimumTargetClaimRaw: commitment.minOut,
    };

    const evidenceRecords = [
      withPayloadHash(aaplonPassport.properties.officialIssuerMappingVerified),
      withPayloadHash(aaplonPassport.properties.tokenProgram),
      withPayloadHash(aaplonPassport.properties.collateralLendingRequiresHolderOptIn),
      withPayloadHash(target.market.priceImpactBps),
    ];

    const expiresAt = new Date(Date.now() + 90_000).toISOString();
    const proof = buildTransitionProof({
      evaluation: target.evaluation,
      covenant,
      passport: aaplonPassport,
      evidenceRecords,
      preState,
      proposedPostState,
      authorityRef: {
        kind: "COVENANT_POSITION_PDA",
        evaluator: evaluator.publicKey.toBase58(),
        maxAutonomousTransitionUsd: 100,
        allowedOperators: ["MIGRATE", "FREEZE"],
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
      operator: "MIGRATE",
    });

    const proofArgs = {
      covenantHash: proof.covenantHash,
      claimPassportHash: proof.claimPassportHash,
      evidenceRoot: proof.evidenceRoot,
      preStateHash: proof.preStateHash,
      proposedPostStateHash: proof.proposedPostStateHash,
      receiptCommitmentHash,
      executionCommitmentHash: commitment.onchainExecutionCommitmentHash,
      targetClaimMint: AAPLON.toBase58(),
      positionVersion: Number(positionBefore.positionVersion),
      nonce: Number(positionBefore.nonce),
      expiryUnix: Math.floor(Date.parse(expiresAt) / 1000),
      operator: OPERATOR_MIGRATE,
      economicValueUsdMicros: Math.round(ECONOMIC_VALUE_USD * 1_000_000),
    };

    const [authorization] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("authorization"),
        position.toBuffer(),
        u64(positionBefore.nonce),
      ],
      PROGRAM_ID,
    );

    const authorizeIx = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: proposer.publicKey, isSigner: true, isWritable: true },
        { pubkey: evaluator.publicKey, isSigner: true, isWritable: false },
        { pubkey: position, isSigner: false, isWritable: false },
        { pubkey: authorization, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeAuthorizeTransition(proofArgs),
    });

    const authorizationSignature = await sendVersioned({
      connection,
      payer: owner,
      signers: [proposer, evaluator],
      instructions: [authorizeIx],
      lookupTableAccounts: [],
    });

    const authorizationInfo = await connection.getAccountInfo(authorization, "confirmed");
    if (!authorizationInfo) {
      throw new Error("Transition authorization PDA missing after evaluator authorization");
    }

    await markStage("TRANSITION_AUTHORIZED", {
      authorization: authorization.toBase58(),
      signature: authorizationSignature,
      proofHash: proof.proofHash,
      executionCommitmentHash: commitment.onchainExecutionCommitmentHash,
    });

    const swapAccounts = (build.swapInstruction.accounts || []).map((account) => ({ ...account }));
    const swapAccountFlagsPacked = packSwapAccountFlags(swapAccounts);
    const swapData = Buffer.from(build.swapInstruction.data, "base64");

    const executeIx = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: proposer.publicKey, isSigner: true, isWritable: true },
        { pubkey: position, isSigner: false, isWritable: true },
        { pubkey: authorization, isSigner: false, isWritable: true },
        { pubkey: sourceTokenAccount, isSigner: false, isWritable: true },
        { pubkey: targetTokenAccount, isSigner: false, isWritable: true },
        { pubkey: JUPITER_PROGRAM, isSigner: false, isWritable: false },
        ...swapAccounts.map((account) => ({
          pubkey: new PublicKey(account.pubkey),
          // Position PDA is promoted to signer only by COVENANT's invoke_signed.
          isSigner: Boolean(account.isSigner) && account.pubkey !== position.toBase58(),
          isWritable: Boolean(account.isWritable),
        })),
      ],
      data: encodeExecuteAuthorizedClaimMigrate({
        migrate: {
          inputMint: AAPLX,
          outputMint: AAPLON,
          inputAmount: SOURCE_AMOUNT,
          minOut: BigInt(commitment.minOut),
          swapInvocationHash: commitment.swapInvocationHash,
          swapAccountFlagsPacked,
          swapData,
        },
      }),
    });

    const computeBudgetIxs = (build.computeBudgetInstructions || []).map(rawInstruction);
    const alts = await lookupTables(connection, build);

    const latestForSizing = await connection.getLatestBlockhash("processed");
    const sizingMessage = new TransactionMessage({
      payerKey: owner.publicKey,
      recentBlockhash: latestForSizing.blockhash,
      instructions: [...computeBudgetIxs, executeIx],
    }).compileToV0Message(alts);
    const sizingTx = new VersionedTransaction(sizingMessage);
    sizingTx.sign([owner, proposer]);
    const serializedBytes = sizingTx.serialize().length;
    if (serializedBytes > 1232) {
      throw new Error(
        "Compact authorized MIGRATE still exceeds Solana transaction size: " +
          serializedBytes + " bytes",
      );
    }

    await markStage("MIGRATION_SUBMITTING", {
      sourceClaim: AAPLX.toBase58(),
      targetClaim: AAPLON.toBase58(),
      sourceAmountRaw: SOURCE_AMOUNT.toString(),
      minOut: commitment.minOut,
      swapInvocationHash: commitment.swapInvocationHash,
      omittedSetupInstructionCount: route.omittedSetupInstructions.length,
      transactionBytes: serializedBytes,
      packedFlagBytes: swapAccountFlagsPacked.length,
      authorization: authorization.toBase58(),
    });

    const migrationSignature = await sendVersioned({
      connection,
      payer: owner,
      signers: [proposer],
      instructions: [...computeBudgetIxs, executeIx],
      lookupTableAccounts: alts,
    });

    const sourceAfter = await tokenAmount(connection, sourceTokenAccount);
    const targetAfter = await tokenAmount(connection, targetTokenAccount);
    const targetReceived = targetAfter - targetBefore;
    if (sourceAfter !== 0n) throw new Error("MIGRATE left residual current-claim balance");
    if (targetReceived < BigInt(commitment.minOut)) throw new Error("MIGRATE target below minOut");

    const positionAfterInfo = await connection.getAccountInfo(position, "confirmed");
    if (!positionAfterInfo) throw new Error("Position missing after MIGRATE");
    const positionAfter = decodePosition(positionAfterInfo.data);
    if (positionAfter.currentClaimMint !== AAPLON.toBase58()) {
      throw new Error("Invariant Position did not move to AAPLon representation");
    }
    if (positionAfter.positionVersion !== positionBefore.positionVersion + 1n) {
      throw new Error("MIGRATE did not advance Position version exactly once");
    }
    if (positionAfter.nonce !== positionBefore.nonce + 1n) {
      throw new Error("MIGRATE did not advance nonce exactly once");
    }
    if (positionAfter.lastReceiptHash !== receiptCommitmentHash) {
      throw new Error("MIGRATE receipt commitment mismatch");
    }

    const replayBefore = { source: sourceAfter, target: targetAfter };
    let replayRejected = false;
    let replayError = null;
    try {
      await sendVersioned({
        connection,
        payer: owner,
        signers: [proposer],
        instructions: [...computeBudgetIxs, executeIx],
        lookupTableAccounts: alts,
      });
    } catch (error) {
      replayRejected = true;
      replayError = String(error);
    }
    const replayAfter = {
      source: await tokenAmount(connection, sourceTokenAccount),
      target: await tokenAmount(connection, targetTokenAccount),
    };
    if (!replayRejected) throw new Error("Consumed MIGRATE proof replay unexpectedly succeeded");
    if (replayAfter.source !== replayBefore.source || replayAfter.target !== replayBefore.target) {
      throw new Error("Rejected MIGRATE replay changed balances");
    }

    const settledState = {
      positionId: position.toBase58(),
      positionVersion: Number(positionAfter.positionVersion),
      nonce: Number(positionAfter.nonce),
      currentClaimMint: positionAfter.currentClaimMint,
      sourceClaimRaw: sourceAfter.toString(),
      targetClaimRaw: targetAfter.toString(),
      targetReceivedRaw: targetReceived.toString(),
    };
    const receipt = buildReceipt({
      proof,
      transactionReference: {
        environment: "SURFPOOL_MAINNET_SHAPED_FORK",
        signature: migrationSignature,
        rpcUrl: surfnet.rpcUrl,
      },
      settledState,
      outcome: "MIGRATED",
      observedAt: new Date().toISOString(),
    });

    const evidence = {
      schemaVersion: "covenant.t4-self-healing-surfpool.v1",
      observedAt: runObservedAt,
      proofStrength: "MIXED_EVIDENCE_REPAIR_PLUS_CONSTRAINED_ONCHAIN_MIGRATION",
      truthBoundary: {
        currentAaplxFailure:
          "REAL fail-closed semantic state: required holder-opt-in lending evidence is UNKNOWN in the bound AAPLx Claim Passport.",
        targetAaplonQualification:
          "AUTHORITATIVE issuer evidence says underlying securities are not lent without express tokenholder consent; exact direct migration route is live Jupiter evidence.",
        execution:
          "REAL constrained AAPLx -> AAPLon state change on a Surfpool mainnet-shaped fork.",
        mainnetFinancialExecution: false,
      },
      environment: {
        kind: "SURFPOOL_MAINNET_SHAPED_FORK",
        covenantProgram: PROGRAM_ID.toBase58(),
        position: position.toBase58(),
        sourceMint: AAPLX.toBase58(),
        targetMint: AAPLON.toBase58(),
      },
      bootstrap: {
        mode: "OWNER_ADOPT_EXISTING_CLAIM",
        note: "Surfpool seeds the pre-existing AAPLx balance before authorization; owner adoption verifies the exact Position-owned Token-2022 account and moves no value.",
        initializeSignature,
        adoptSignature,
        authorizationSignature,
        authorization: authorization.toBase58(),
        authorizationModel:
          "Full evaluator-approved Transition Proof stored in nonce-bound PDA before compact execution transaction",
      },
      revalidation: {
        current: {
          claimId: aaplxPassport.id,
          decision: current.evaluation.decision,
          ruleResults: current.evaluation.ruleResults,
          acquisitionRouteSnapshot: currentRouteQuote,
        },
        target: {
          claimId: aaplonPassport.id,
          decision: target.evaluation.decision,
          ruleResults: target.evaluation.ruleResults,
          exactMigrationRoute: migrationQuote,
        },
        repairPlan,
      },
      route: {
        source: route.url,
        executionCommitmentHash: commitment.executionCommitmentHash,
        onchainExecutionCommitmentHash: commitment.onchainExecutionCommitmentHash,
        swapInvocationHash: commitment.swapInvocationHash,
        inAmount: commitment.inAmount,
        quotedOutAmount: commitment.quotedOutAmount,
        minOut: commitment.minOut,
        priceImpactPct: commitment.priceImpactPct,
        lookupTableAddresses: commitment.lookupTableAddresses,
        omittedSetupInstructionCount: route.omittedSetupInstructions.length,
        setupExecution: {
          mode: "ALLOWLISTED_NON_ECONOMIC_PRECONDITION",
          allowedPrograms: [...SAFE_SETUP_PROGRAMS],
          instructions: setupSummary,
          signatures: setupSignatures,
          sourceTargetBalancesUnchanged: true,
        },
      },
      migration: {
        signature: migrationSignature,
        authorizationSignature,
        authorization: authorization.toBase58(),
        preState,
        settledState,
        sourceFullyConsumed: sourceAfter === 0n,
        targetReceivedAtLeastMinOut: targetReceived >= BigInt(commitment.minOut),
        positionIdentityPreserved: preState.positionId === settledState.positionId,
        representationChanged:
          preState.currentClaimMint === AAPLX.toBase58() &&
          settledState.currentClaimMint === AAPLON.toBase58(),
        onchainReceiptCommitmentHash: receiptCommitmentHash,
        finalReceipt: receipt,
      },
      replay: {
        rejected: replayRejected,
        error: replayError,
        balancesUnchanged:
          replayAfter.source === replayBefore.source &&
          replayAfter.target === replayBefore.target,
      },
      assertion:
        "The same Invariant Position survived a representation failure, persisted one fresh evaluator-approved proof as a nonce-bound authorization, migrated the full current Claim through the governed path, and rejected replay.",
    };

    await mkdir(resolve(ROOT, "evidence/t4"), { recursive: true });
    const path = resolve(
      ROOT,
      "evidence/t4/self-healing-" +
        new Date().toISOString().replace(/[:.]/g, "-") +
        ".json",
    );
    await writeFile(path, JSON.stringify(evidence, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value, 2) + "\n");

    await markStage("PASS", {
      evidencePath: path,
      migrationSignature,
      sourceClaim: AAPLX.toBase58(),
      targetClaim: AAPLON.toBase58(),
      targetReceivedRaw: targetReceived.toString(),
    });
    console.log(JSON.stringify(evidence, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value, 2));
    console.error("\nCOVENANT T4 SELF-HEALING MIGRATION: PASS");
    console.error("Evidence: " + path);
  } finally {
    surfnet.stop();
  }
}

main().catch(async (error) => {
  try {
    await markStage("FAIL_CLOSED", { error: String(error) });
  } catch {}
  console.error("\nCOVENANT T4 SELF-HEALING MIGRATION: FAIL_CLOSED");
  console.error(error);
  process.exitCode = 1;
});
