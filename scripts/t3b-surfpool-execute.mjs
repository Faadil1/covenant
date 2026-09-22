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
import {
  buildTransitionProof,
  buildReceipt,
  sha256Canonical,
} from "../src/proof/transition-proof.mjs";
import { buildJupiterExecutionCommitment } from "../src/execution/jupiter-v2.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PROGRESS_PATH = resolve(ROOT, "evidence/t3b/surfpool-execution-progress.json");

async function markStage(stage, detail = {}) {
  await mkdir(resolve(ROOT, "evidence/t3b"), { recursive: true });
  const payload = {
    schemaVersion: "covenant.t3b-surfpool-progress.v1",
    observedAt: new Date().toISOString(),
    stage,
    detail,
  };
  await writeFile(PROGRESS_PATH, JSON.stringify(payload, null, 2) + "\n");
  console.error("[COVENANT T3b] " + stage + " " + JSON.stringify(detail));
}

const PROGRAM_ID = new PublicKey("CEKUNCY7VYeHdwyyWCJTKQkGgMzPeTsx2uwBoQ98wm3z");
const JUPITER_PROGRAM = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const AAPLX = new PublicKey("XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp");
const AAPLON = new PublicKey("123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo");
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

const INPUT_AMOUNT = BigInt(process.env.COVENANT_INPUT_AMOUNT || "100000000");
const ECONOMIC_VALUE_USD = Number(process.env.COVENANT_ECONOMIC_VALUE_USD || "100");
const MAX_SLIPPAGE_BPS = Number(process.env.COVENANT_SLIPPAGE_BPS || "50");
const MAINNET_RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const JUPITER_V2 = process.env.JUPITER_API_BASE || "https://api.jup.ag/swap/v2";
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || "";
const JUPITER_QUOTE = process.env.JUPITER_QUOTE_URL || "https://lite-api.jup.ag/swap/v1/quote";

const OPERATOR_ACQUIRE = 0;
const ACQUIRE_MASK = 1 << OPERATOR_ACQUIRE;

const covenant = JSON.parse(
  await readFile(resolve(ROOT, "fixtures/apple-executable-covenant.json"), "utf8"),
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

async function liveQuote(outputMint) {
  const params = new URLSearchParams({
    inputMint: USDC.toBase58(),
    outputMint: outputMint.toBase58(),
    amount: INPUT_AMOUNT.toString(),
    slippageBps: String(MAX_SLIPPAGE_BPS),
    restrictIntermediateTokens: "true",
  });
  const url = JUPITER_QUOTE + "?" + params;
  const body = await fetchJson(url);
  if (!body.outAmount || body.priceImpactPct == null) {
    throw new Error("Jupiter quote omitted outAmount/priceImpactPct for " + outputMint.toBase58());
  }
  return {
    source: url,
    observedAt: new Date().toISOString(),
    outAmount: String(body.outAmount),
    minOut: String(body.otherAmountThreshold || "0"),
    priceImpactPct: String(body.priceImpactPct),
    priceImpactBps: Number(body.priceImpactPct) * 10_000,
    routeLabels: (body.routePlan || []).map((step) => step.swapInfo?.label).filter(Boolean),
    contextSlot: body.contextSlot ?? null,
  };
}

async function buildJupiterRoute({ taker, destinationTokenAccount }) {
  const params = new URLSearchParams({
    inputMint: USDC.toBase58(),
    outputMint: AAPLX.toBase58(),
    amount: INPUT_AMOUNT.toString(),
    taker: taker.toBase58(),
    slippageBps: String(MAX_SLIPPAGE_BPS),
    wrapAndUnwrapSol: "false",
    destinationTokenAccount: destinationTokenAccount.toBase58(),
  });
  const headers = JUPITER_API_KEY ? { "x-api-key": JUPITER_API_KEY } : {};
  const url = JUPITER_V2 + "/build?" + params;
  const build = await fetchJson(url, { headers });

  // Jupiter builds against mainnet and cannot observe fork-only token accounts
  // created by Surfpool for the Position PDA. It may therefore propose ATA
  // setup instructions even though the exact source/destination accounts
  // already exist in this fork. We deliberately DO NOT execute setup material.
  // The governed swap CPI remains the only economic transition, and the
  // program independently verifies the exact Position-owned token accounts.
  const omittedSetupInstructions = build.setupInstructions || [];
  if (build.cleanupInstruction || (build.otherInstructions || []).length > 0 || build.tipInstruction) {
    throw new Error("T3b fail-closed: Jupiter returned unbound cleanup/other/tip instruction material");
  }

  const commitment = buildJupiterExecutionCommitment({
    build,
    expectedInputMint: USDC.toBase58(),
    expectedOutputMint: AAPLX.toBase58(),
    expectedInAmount: INPUT_AMOUNT.toString(),
    expectedTaker: taker.toBase58(),
    maxSlippageBps: MAX_SLIPPAGE_BPS,
  });
  return {
    url,
    build,
    commitment,
    omittedSetupInstructions,
  };
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

function evaluateClaim({ passport, quote, now, amountUsd = ECONOMIC_VALUE_USD }) {
  const market = {
    priceImpactBps: evidenceRecord(
      quote.priceImpactBps,
      "LIVE_MARKET_OR_ORACLE",
      quote.observedAt,
      quote.source,
    ),
  };
  const authority = {
    allowedOperators: ["ACQUIRE"],
    maxAutonomousTransitionUsd: 100,
  };
  const proposal = {
    positionId: "position:apple:stocklana",
    operator: "ACQUIRE",
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

async function main() {
  const runObservedAt = new Date().toISOString();
  await markStage("HARNESS_START", { mainnetRpc: MAINNET_RPC });
  const payerInfo = Surfnet.newKeypair();
  await markStage("SURFNET_STARTING");
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

    const soPath = resolve(ROOT, "anchor/target/deploy/covenant_runtime.so");
    const idlPath = resolve(ROOT, "anchor/target/idl/covenant_runtime.json");
    const deployed = surfnet.deploy({
      programId: PROGRAM_ID.toBase58(),
      soPath,
      idlPath,
    });
    if (deployed !== PROGRAM_ID.toBase58()) {
      throw new Error("Surfpool deployed unexpected program id: " + deployed);
    }
    await markStage("PROGRAM_DEPLOYED", { programId: deployed });

    const positionId = hashBytes(Buffer.from("COVENANT:APPLE:STOCKLANA:POSITION:42"));
    const covenantHashHex = sha256Canonical(covenant);
    const covenantHash = Buffer.from(covenantHashHex, "hex");
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
        covenantHash,
        evaluator: evaluator.publicKey,
        maxUsdMicros: BigInt(Math.round(ECONOMIC_VALUE_USD * 1_000_000)),
        operatorMask: ACQUIRE_MASK,
      }),
    });

    const initSignature = await sendVersioned({
      connection,
      payer: owner,
      signers: [],
      instructions: [initialize],
      lookupTableAccounts: [],
    });
    await markStage("POSITION_INITIALIZED", {
      position: position.toBase58(),
      signature: initSignature,
    });

    const classic = TOKEN_PROGRAM.toBase58();
    const token2022 = TOKEN_2022_PROGRAM.toBase58();
    surfnet.fundToken(position.toBase58(), USDC.toBase58(), Number(INPUT_AMOUNT * 2n), classic);
    surfnet.fundToken(position.toBase58(), AAPLX.toBase58(), 1, token2022);
    surfnet.setTokenBalance(position.toBase58(), AAPLX.toBase58(), 0, token2022);

    const inputTokenAccount = new PublicKey(
      surfnet.getAta(position.toBase58(), USDC.toBase58(), classic),
    );
    const outputTokenAccount = new PublicKey(
      surfnet.getAta(position.toBase58(), AAPLX.toBase58(), token2022),
    );

    const positionInfoBefore = await connection.getAccountInfo(position, "confirmed");
    if (!positionInfoBefore) throw new Error("Position account missing after initialize");
    const positionBefore = decodePosition(positionInfoBefore.data);
    if (positionBefore.covenantHash !== covenantHashHex) {
      throw new Error("Onchain Covenant hash differs from executable Covenant fixture");
    }

    const [aaplxQuote, aaplonQuote] = await Promise.all([
      liveQuote(AAPLX),
      liveQuote(AAPLON),
    ]);
    const now = new Date().toISOString();
    const allow = evaluateClaim({ passport: aaplxPassport, quote: aaplxQuote, now });
    if (allow.evaluation.decision !== Decision.ALLOW) {
      throw new Error(
        "Live AAPLx transition did not ALLOW: " +
          JSON.stringify(allow.evaluation.ruleResults),
      );
    }

    let refuse = evaluateClaim({ passport: aaplonPassport, quote: aaplonQuote, now });
    let refuseMode = "ALTERNATIVE_CLAIM_LIVE_MARKET";
    if (refuse.evaluation.decision !== Decision.REFUSE) {
      const staleObservedAt = new Date(Date.now() - 60_000).toISOString();
      const staleQuote = { ...aaplxQuote, observedAt: staleObservedAt };
      refuse = evaluateClaim({
        passport: aaplxPassport,
        quote: staleQuote,
        now,
      });
      refuseMode = "SAME_CLAIM_STALE_EVIDENCE";
    }
    if (refuse.evaluation.decision !== Decision.REFUSE) {
      throw new Error("Canonical REFUSE case did not fail closed");
    }
    let refusedProofCreated = true;
    try {
      buildTransitionProof({ evaluation: refuse.evaluation });
    } catch {
      refusedProofCreated = false;
    }
    if (refusedProofCreated) {
      throw new Error("REFUSE evaluation unexpectedly produced executable proof");
    }

    const route = await buildJupiterRoute({
      taker: position,
      destinationTokenAccount: outputTokenAccount,
    });
    const { build, commitment } = route;
    await markStage("ROUTE_BOUND", {
      outputMint: AAPLX.toBase58(),
      minOut: commitment.minOut,
      swapInvocationHash: commitment.swapInvocationHash,
      omittedSetupInstructionCount: route.omittedSetupInstructions.length,
      setupReason:
        route.omittedSetupInstructions.length > 0
          ? "Jupiter mainnet builder cannot observe fork-only Position token accounts; setup is not executed"
          : "none",
    });

    const inputBefore = await tokenAmount(connection, inputTokenAccount);
    const outputBefore = await tokenAmount(connection, outputTokenAccount);

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
      withPayloadHash(aaplxPassport.properties.officialIssuerMappingVerified),
      withPayloadHash(aaplxPassport.properties.tokenProgram),
      withPayloadHash(allow.market.priceImpactBps),
    ];
    const expiresAt = new Date(Date.now() + 90_000).toISOString();
    const proof = buildTransitionProof({
      evaluation: allow.evaluation,
      covenant,
      passport: aaplxPassport,
      evidenceRecords,
      preState,
      proposedPostState,
      authorityRef: {
        kind: "COVENANT_POSITION_PDA",
        evaluator: evaluator.publicKey.toBase58(),
        maxAutonomousTransitionUsd: 100,
        allowedOperators: ["ACQUIRE"],
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
      if (
        account.isSigner &&
        account.pubkey !== position.toBase58()
      ) {
        throw new Error(
          "T3b fail-closed: Jupiter route requires unsupported external signer " +
            account.pubkey,
        );
      }
    }
    const swapAccountFlags = swapAccounts.map(
      (account) => (account.isSigner ? 1 : 0) | (account.isWritable ? 2 : 0),
    );
    const swapData = Buffer.from(build.swapInstruction.data, "base64");

    const executeIx = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: proposer.publicKey, isSigner: true, isWritable: false },
        { pubkey: evaluator.publicKey, isSigner: true, isWritable: false },
        { pubkey: position, isSigner: false, isWritable: true },
        { pubkey: inputTokenAccount, isSigner: false, isWritable: true },
        { pubkey: outputTokenAccount, isSigner: false, isWritable: true },
        { pubkey: JUPITER_PROGRAM, isSigner: false, isWritable: false },
        ...swapAccounts.map((account) => ({
          pubkey: new PublicKey(account.pubkey),
          // The Position PDA signs only inside COVENANT via invoke_signed.
          isSigner: Boolean(account.isSigner) && account.pubkey !== position.toBase58(),
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

    const computeBudgetIxs = (build.computeBudgetInstructions || []).map(rawInstruction);
    const alts = await lookupTables(connection, build);
    await markStage("GOVERNED_EXECUTION_SUBMITTING", {
      position: position.toBase58(),
      inputAmount: INPUT_AMOUNT.toString(),
      minOut: commitment.minOut,
    });
    const executionSignature = await sendVersioned({
      connection,
      payer: owner,
      signers: [proposer, evaluator],
      instructions: [...computeBudgetIxs, executeIx],
      lookupTableAccounts: alts,
    });
    await markStage("GOVERNED_EXECUTION_CONFIRMED", {
      signature: executionSignature,
    });

    const inputAfter = await tokenAmount(connection, inputTokenAccount);
    const outputAfter = await tokenAmount(connection, outputTokenAccount);
    const spent = inputBefore - inputAfter;
    const received = outputAfter - outputBefore;
    if (spent !== INPUT_AMOUNT) {
      throw new Error("Postcondition failed: exact USDC spend mismatch");
    }
    if (received < BigInt(commitment.minOut)) {
      throw new Error("Postcondition failed: output below committed minOut");
    }

    const positionInfoAfter = await connection.getAccountInfo(position, "confirmed");
    if (!positionInfoAfter) throw new Error("Position account disappeared after execution");
    const positionAfter = decodePosition(positionInfoAfter.data);
    if (positionAfter.currentClaimMint !== AAPLX.toBase58()) {
      throw new Error("Position current_claim_mint did not advance to AAPLx");
    }
    if (positionAfter.positionVersion !== positionBefore.positionVersion + 1n) {
      throw new Error("Position version did not advance exactly once");
    }
    if (positionAfter.nonce !== positionBefore.nonce + 1n) {
      throw new Error("Position nonce did not advance exactly once");
    }
    if (positionAfter.lastReceiptHash !== receiptCommitmentHash) {
      throw new Error("Onchain receipt commitment differs from proof-bound commitment");
    }

    const replayBefore = {
      input: await tokenAmount(connection, inputTokenAccount),
      output: await tokenAmount(connection, outputTokenAccount),
    };
    let replayRejected = false;
    let replayError = null;
    try {
      await sendVersioned({
        connection,
        payer: owner,
        signers: [proposer, evaluator],
        instructions: [...computeBudgetIxs, executeIx],
        lookupTableAccounts: alts,
      });
    } catch (error) {
      replayRejected = true;
      replayError = String(error);
    }
    const replayAfter = {
      input: await tokenAmount(connection, inputTokenAccount),
      output: await tokenAmount(connection, outputTokenAccount),
    };
    if (!replayRejected) throw new Error("Consumed proof replay unexpectedly succeeded");
    if (replayAfter.input !== replayBefore.input || replayAfter.output !== replayBefore.output) {
      throw new Error("Rejected replay changed economic balances");
    }
    await markStage("REPLAY_REJECTED", {
      balancesUnchanged: true,
      error: replayError,
    });

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
        environment: "SURFPOOL_MAINNET_SHAPED_FORK",
        signature: executionSignature,
        rpcUrl: surfnet.rpcUrl,
      },
      settledState,
      outcome: "EXECUTED",
      observedAt: new Date().toISOString(),
    });

    const evidence = {
      schemaVersion: "covenant.t3b-surfpool-execution.v1",
      observedAt: runObservedAt,
      proofStrength: "L2_SIGNED_PREFLIGHT_PLUS_CONSTRAINED_ONCHAIN_EXECUTION",
      underlyingIntent: covenant.underlyingIntent,
      environment: {
        kind: "SURFPOOL_MAINNET_SHAPED_FORK",
        remoteRpc: MAINNET_RPC,
        covenantProgram: PROGRAM_ID.toBase58(),
        jupiterProgram: JUPITER_PROGRAM.toBase58(),
        position: position.toBase58(),
        inputMint: USDC.toBase58(),
        outputMint: AAPLX.toBase58(),
        inputTokenAccount: inputTokenAccount.toBase58(),
        outputTokenAccount: outputTokenAccount.toBase58(),
      },
      setup: {
        note: "Surfpool cheatcodes seed fork-only test balances before the governed transition. No hidden state edit occurs after proof authorization begins.",
        initializeSignature: initSignature,
        initialUsdcRaw: inputBefore.toString(),
        initialOutputRaw: outputBefore.toString(),
      },
      policy: {
        allow: {
          claimId: aaplxPassport.id,
          decision: allow.evaluation.decision,
          ruleResults: allow.evaluation.ruleResults,
          quote: aaplxQuote,
          proofHash: proof.proofHash,
        },
        refuse: {
          mode: refuseMode,
          claimId:
            refuseMode === "ALTERNATIVE_CLAIM_LIVE_MARKET"
              ? aaplonPassport.id
              : aaplxPassport.id,
          decision: refuse.evaluation.decision,
          ruleResults: refuse.evaluation.ruleResults,
          quote:
            refuseMode === "ALTERNATIVE_CLAIM_LIVE_MARKET"
              ? aaplonQuote
              : { ...aaplxQuote, observedAt: refuse.market.priceImpactBps.observedAt },
          executableProofCreated: refusedProofCreated,
        },
      },
      route: {
        source: route.url,
        executionCommitmentHash: commitment.executionCommitmentHash,
        onchainExecutionCommitmentHash: commitment.onchainExecutionCommitmentHash,
        swapInvocationHash: commitment.swapInvocationHash,
        inAmount: commitment.inAmount,
        quotedOutAmount: commitment.quotedOutAmount,
        minOut: commitment.minOut,
        slippageBps: commitment.slippageBps,
        priceImpactPct: commitment.priceImpactPct,
        lookupTableAddresses: commitment.lookupTableAddresses,
        omittedSetupInstructionCount: route.omittedSetupInstructions.length,
        omittedSetupInstructionsHash: commitment.setupInstructionsHash,
        setupExecution: "NOT_EXECUTED — exact Position token accounts pre-exist in fork",
      },
      execution: {
        signature: executionSignature,
        preState,
        settledState,
        onchainReceiptCommitmentHash: receiptCommitmentHash,
        finalReceipt: receipt,
      },
      replay: {
        rejected: replayRejected,
        error: replayError,
        balancesUnchanged:
          replayAfter.input === replayBefore.input &&
          replayAfter.output === replayBefore.output,
      },
      assertion:
        "An ALLOW proof unlocked one exact USDC->AAPLx economic state transition. A REFUSE evaluation could not create executable proof, and the consumed ALLOW proof could not be replayed.",
    };

    await mkdir(resolve(ROOT, "evidence/t3b"), { recursive: true });
    const path = resolve(
      ROOT,
      "evidence/t3b/surfpool-execution-" +
        new Date().toISOString().replace(/[:.]/g, "-") +
        ".json",
    );
    await writeFile(path, JSON.stringify(evidence, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value, 2) + "\n");

    await markStage("PASS", {
      signature: executionSignature,
      evidencePath: path,
      outputReceivedRaw: received.toString(),
    });
    console.log(JSON.stringify(evidence, null, 2));
    console.error("\nCOVENANT T3b SURFPOOL EXECUTION: PASS");
    console.error("Evidence: " + path);
  } finally {
    surfnet.stop();
  }
}

main().catch(async (error) => {
  try {
    await markStage("FAIL_CLOSED", { error: String(error) });
  } catch (progressError) {
    console.error("Could not persist T3b progress failure:", progressError);
  }
  console.error("\nCOVENANT T3b SURFPOOL EXECUTION: FAIL_CLOSED");
  console.error(error);
  process.exitCode = 1;
});
