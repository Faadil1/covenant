import test from "node:test";
import assert from "node:assert/strict";
import {
  buildJupiterExecutionCommitment,
  JUPITER_V6_PROGRAM,
} from "../src/execution/jupiter-v2.mjs";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const AAPLON = "123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo";

function ix(programId = JUPITER_V6_PROGRAM, byte = 7) {
  return {
    programId,
    accounts: [
      { pubkey: USDC, isSigner: false, isWritable: true },
      { pubkey: AAPLON, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([byte, 1, 2, 3]).toString("base64"),
  };
}

function buildFixture() {
  return {
    inputMint: USDC,
    outputMint: AAPLON,
    inAmount: "100000000",
    outAmount: "401234567",
    otherAmountThreshold: "399000000",
    swapMode: "ExactIn",
    slippageBps: 50,
    priceImpactPct: "0.0002",
    routePlan: [
      {
        percent: 100,
        bps: 10000,
        swapInfo: {
          ammKey: "amm111",
          label: "Meteora DLMM",
          inputMint: USDC,
          outputMint: AAPLON,
          inAmount: "100000000",
          outAmount: "401234567",
        },
      },
    ],
    computeBudgetInstructions: [
      ix("ComputeBudget111111111111111111111111111111", 1),
    ],
    setupInstructions: [],
    swapInstruction: ix(),
    cleanupInstruction: null,
    otherInstructions: [],
    tipInstruction: null,
    addressesByLookupTableAddress: {
      ALT111: [USDC, AAPLON],
    },
    blockhashWithMetadata: {
      blockhash: Array.from({ length: 32 }, (_, i) => i),
      lastValidBlockHeight: 123456,
      fetchedAt: { secs_since_epoch: 1780000000, nanos_since_epoch: 0 },
    },
  };
}

function commit(build = buildFixture()) {
  return buildJupiterExecutionCommitment({
    build,
    expectedInputMint: USDC,
    expectedOutputMint: AAPLON,
    expectedInAmount: "100000000",
    expectedTaker: "PositionPDA111",
    maxSlippageBps: 50,
  });
}

test("exact Jupiter V2 build becomes deterministic execution commitment", () => {
  const a = commit();
  const b = commit();
  assert.equal(a.executionCommitmentHash, b.executionCommitmentHash);
  assert.equal(a.swapProgramId, JUPITER_V6_PROGRAM);
  assert.equal(a.minOut, "399000000");
});

test("wrong output claim cannot be committed", () => {
  const build = buildFixture();
  build.outputMint = "WrongClaim111";
  assert.throws(() => commit(build), /output mint differs/);
});

test("wrong input amount cannot be committed", () => {
  const build = buildFixture();
  build.inAmount = "100000001";
  assert.throws(() => commit(build), /input amount differs/);
});

test("route instruction substitution changes commitment hash", () => {
  const original = commit();
  const build = buildFixture();
  build.swapInstruction.data = Buffer.from([8, 1, 2, 3]).toString("base64");
  const changed = commit(build);
  assert.notEqual(
    changed.executionCommitmentHash,
    original.executionCommitmentHash,
  );
});

test("account-order substitution changes both execution and CPI invocation hash", () => {
  const original = commit();
  const build = buildFixture();
  build.swapInstruction.accounts.reverse();
  const changed = commit(build);
  assert.notEqual(
    changed.executionCommitmentHash,
    original.executionCommitmentHash,
  );
  assert.notEqual(changed.swapInvocationHash, original.swapInvocationHash);
});

test("account privilege substitution changes CPI invocation hash", () => {
  const original = commit();
  const build = buildFixture();
  build.swapInstruction.accounts[0].isWritable = false;
  const changed = commit(build);
  assert.notEqual(changed.swapInvocationHash, original.swapInvocationHash);
});

test("unapproved swap program is refused", () => {
  const build = buildFixture();
  build.swapInstruction.programId = "BadProgram111";
  assert.throws(() => commit(build), /Unapproved Jupiter swap program/);
});

test("Jupiter slippage tolerance cannot exceed Covenant bound", () => {
  const build = buildFixture();
  build.slippageBps = 75;
  assert.throws(() => commit(build), /slippage tolerance exceeds/);
});
