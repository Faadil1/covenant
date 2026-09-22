import { createHash } from "node:crypto";
import { sha256Canonical } from "../proof/transition-proof.mjs";

export const JUPITER_V6_PROGRAM =
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Missing/invalid Jupiter build field: " + field);
  }
}

function normalizeInstruction(ix, field) {
  if (!ix || typeof ix !== "object") {
    throw new Error("Missing Jupiter instruction: " + field);
  }
  assertString(ix.programId, field + ".programId");
  assertString(ix.data, field + ".data");
  if (!Array.isArray(ix.accounts)) {
    throw new Error("Missing/invalid Jupiter accounts: " + field + ".accounts");
  }

  const decoded = Buffer.from(ix.data, "base64");

  return {
    programId: ix.programId,
    accounts: ix.accounts.map((account, index) => {
      assertString(account?.pubkey, field + ".accounts[" + index + "].pubkey");
      return {
        pubkey: account.pubkey,
        isSigner: Boolean(account.isSigner),
        isWritable: Boolean(account.isWritable),
      };
    }),
    dataSha256: sha256Bytes(decoded),
    dataLength: decoded.length,
  };
}

function normalizeInstructionArray(ixs, field) {
  if (ixs == null) return [];
  if (!Array.isArray(ixs)) {
    throw new Error("Invalid Jupiter instruction array: " + field);
  }
  return ixs.map((ix, index) =>
    normalizeInstruction(ix, field + "[" + index + "]"),
  );
}

function positiveIntegerString(value, field) {
  assertString(value, field);
  if (!/^\d+$/.test(value) || BigInt(value) <= 0n) {
    throw new Error("Expected positive integer string: " + field);
  }
  return value;
}

/**
 * Convert a Jupiter Swap API V2 /build response into the exact commitment
 * COVENANT can bind to an ALLOW proof.
 *
 * This does not authorize the route. It only makes route substitution
 * detectable after deterministic policy evaluation has already returned ALLOW.
 */
export function buildJupiterExecutionCommitment({
  build,
  expectedInputMint,
  expectedOutputMint,
  expectedInAmount,
  expectedTaker = null,
  maxSlippageBps = null,
}) {
  if (!build || typeof build !== "object") {
    throw new Error("Jupiter /build response is required");
  }

  assertString(expectedInputMint, "expectedInputMint");
  assertString(expectedOutputMint, "expectedOutputMint");
  positiveIntegerString(String(expectedInAmount), "expectedInAmount");

  if (build.inputMint !== expectedInputMint) {
    throw new Error("Jupiter build input mint differs from proven transition");
  }
  if (build.outputMint !== expectedOutputMint) {
    throw new Error("Jupiter build output mint differs from Claim Passport");
  }
  if (String(build.inAmount) !== String(expectedInAmount)) {
    throw new Error("Jupiter build input amount differs from proven transition");
  }
  if (build.swapMode && build.swapMode !== "ExactIn") {
    throw new Error("Unsupported Jupiter swap mode: " + build.swapMode);
  }

  const outAmount = positiveIntegerString(String(build.outAmount), "outAmount");
  const minOut = positiveIntegerString(
    String(build.otherAmountThreshold),
    "otherAmountThreshold",
  );

  if (BigInt(minOut) > BigInt(outAmount)) {
    throw new Error("Jupiter minimum output exceeds quoted output");
  }

  if (
    maxSlippageBps != null &&
    (!Number.isFinite(build.slippageBps) ||
      Number(build.slippageBps) > Number(maxSlippageBps))
  ) {
    throw new Error("Jupiter build slippage tolerance exceeds Covenant bound");
  }

  const swapInstruction = normalizeInstruction(
    build.swapInstruction,
    "swapInstruction",
  );
  if (swapInstruction.programId !== JUPITER_V6_PROGRAM) {
    throw new Error(
      "Unapproved Jupiter swap program: " + swapInstruction.programId,
    );
  }

  const setupInstructions = normalizeInstructionArray(
    build.setupInstructions,
    "setupInstructions",
  );
  const computeBudgetInstructions = normalizeInstructionArray(
    build.computeBudgetInstructions,
    "computeBudgetInstructions",
  );
  const otherInstructions = normalizeInstructionArray(
    build.otherInstructions,
    "otherInstructions",
  );
  const cleanupInstruction = build.cleanupInstruction
    ? normalizeInstruction(build.cleanupInstruction, "cleanupInstruction")
    : null;
  const tipInstruction = build.tipInstruction
    ? normalizeInstruction(build.tipInstruction, "tipInstruction")
    : null;

  const lookupTables =
    build.addressesByLookupTableAddress &&
    typeof build.addressesByLookupTableAddress === "object"
      ? Object.fromEntries(
          Object.entries(build.addressesByLookupTableAddress)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([table, addresses]) => {
              if (!Array.isArray(addresses)) {
                throw new Error("Invalid ALT address list for " + table);
              }
              return [table, [...addresses]];
            }),
        )
      : {};

  const routePlan = Array.isArray(build.routePlan) ? build.routePlan : [];

  const blockhash = build.blockhashWithMetadata ?? null;
  if (!blockhash || !Array.isArray(blockhash.blockhash)) {
    throw new Error("Jupiter build response has no blockhash metadata");
  }

  const commitment = {
    schemaVersion: "covenant.jupiter-v2-execution-commitment.v1",
    router: "JUPITER_METIS_V2_BUILD",
    taker: expectedTaker,
    inputMint: build.inputMint,
    outputMint: build.outputMint,
    inAmount: String(build.inAmount),
    quotedOutAmount: outAmount,
    minOut,
    slippageBps: Number(build.slippageBps),
    priceImpactPct:
      build.priceImpactPct == null ? null : String(build.priceImpactPct),
    swapProgramId: swapInstruction.programId,
    swapInstruction,
    setupInstructionsHash: sha256Canonical(setupInstructions),
    computeBudgetInstructionsHash: sha256Canonical(computeBudgetInstructions),
    otherInstructionsHash: sha256Canonical(otherInstructions),
    cleanupInstructionHash: cleanupInstruction
      ? sha256Canonical(cleanupInstruction)
      : null,
    tipInstructionHash: tipInstruction
      ? sha256Canonical(tipInstruction)
      : null,
    routePlanHash: sha256Canonical(routePlan),
    lookupTablesHash: sha256Canonical(lookupTables),
    lookupTableAddresses: Object.keys(lookupTables),
    blockhashBytesHash: sha256Canonical(blockhash.blockhash),
    lastValidBlockHeight: Number(blockhash.lastValidBlockHeight),
    blockhashFetchedAt: blockhash.fetchedAt ?? null,
  };

  return {
    ...commitment,
    executionCommitmentHash: sha256Canonical(commitment),
  };
}
