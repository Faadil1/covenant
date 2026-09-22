import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { sha256Canonical } from "../src/proof/transition-proof.mjs";
import {
  AAPLX,
  ACQUIRE_MASK,
  PROGRAM_ID,
  USDC,
  assertMainnetProgram,
  derivePosition,
  encodeInitialize,
  explorerTx,
  loadLocalKeypair,
  mainnetConnection,
  sendAndConfirmVersioned,
  u64,
} from "../src/execution/mainnet-canary-helpers.mjs";

const CONSENT = "I_UNDERSTAND_THIS_MOVES_REAL_FUNDS";
if (process.env.COVENANT_MAINNET_SETUP !== CONSENT) {
  throw new Error(
    "Mainnet setup is locked. Set COVENANT_MAINNET_SETUP=" + CONSENT +
      " only when you intend to create accounts and move the capped USDC funding.",
  );
}

const INPUT_AMOUNT = BigInt(
  process.env.COVENANT_MAINNET_INPUT_AMOUNT || "5000000",
);
const ECONOMIC_VALUE_USD = Number(
  process.env.COVENANT_MAINNET_ECONOMIC_VALUE_USD || "5",
);
const ABSOLUTE_CAP_RAW = 20_000_000n;
const ABSOLUTE_CAP_USD = 20;
if (INPUT_AMOUNT <= 0n || INPUT_AMOUNT > ABSOLUTE_CAP_RAW) {
  throw new Error("Setup refuses more than $20 USDC");
}
if (
  !Number.isFinite(ECONOMIC_VALUE_USD) ||
  ECONOMIC_VALUE_USD <= 0 ||
  ECONOMIC_VALUE_USD > ABSOLUTE_CAP_USD
) {
  throw new Error("Setup economic value must be >$0 and <=$20");
}

const covenant = JSON.parse(
  await readFile("fixtures/apple-mainnet-canary-covenant.json", "utf8"),
);
const covenantHashHex = sha256Canonical(covenant);
const covenantHash = Buffer.from(covenantHashHex, "hex");

const connection = mainnetConnection();
const { keypair: owner } = await loadLocalKeypair();
const { genesisHash } = await assertMainnetProgram(connection);
const { position, positionId } = derivePosition(owner.publicKey);

if (await connection.getAccountInfo(position, "confirmed")) {
  throw new Error(
    "Mainnet Position already exists at " + position.toBase58() +
      ". Refusing to reinitialize.",
  );
}

const ownerUsdc = getAssociatedTokenAddressSync(
  USDC,
  owner.publicKey,
  false,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
);
const positionUsdc = getAssociatedTokenAddressSync(
  USDC,
  position,
  true,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
);
const positionAaplx = getAssociatedTokenAddressSync(
  AAPLX,
  position,
  true,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
);

const ownerUsdcInfo = await connection.getAccountInfo(ownerUsdc, "confirmed");
if (!ownerUsdcInfo) {
  throw new Error(
    "Owner has no canonical USDC ATA at " + ownerUsdc.toBase58(),
  );
}
const ownerUsdcBalance = BigInt(
  (await connection.getTokenAccountBalance(ownerUsdc, "confirmed")).value.amount,
);
if (ownerUsdcBalance < INPUT_AMOUNT) {
  throw new Error(
    "Insufficient USDC. Need " + INPUT_AMOUNT + " raw, have " + ownerUsdcBalance,
  );
}

const initializeIx = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: owner.publicKey, isSigner: true, isWritable: true },
    { pubkey: position, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: encodeInitialize({
    positionId,
    covenantHash,
    evaluator: owner.publicKey,
    maxUsdMicros: BigInt(ABSOLUTE_CAP_USD * 1_000_000),
    operatorMask: ACQUIRE_MASK,
  }),
});

const instructions = [
  initializeIx,
  createAssociatedTokenAccountIdempotentInstruction(
    owner.publicKey,
    positionUsdc,
    position,
    USDC,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  ),
  createAssociatedTokenAccountIdempotentInstruction(
    owner.publicKey,
    positionAaplx,
    position,
    AAPLX,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  ),
  createTransferCheckedInstruction(
    ownerUsdc,
    USDC,
    positionUsdc,
    owner.publicKey,
    INPUT_AMOUNT,
    6,
    [],
    TOKEN_PROGRAM_ID,
  ),
];

const beforeSol = await connection.getBalance(owner.publicKey, "confirmed");
const signature = await sendAndConfirmVersioned({
  connection,
  payer: owner,
  instructions,
});
const afterSol = await connection.getBalance(owner.publicKey, "confirmed");

const [positionInfo, fundedUsdc, outputInfo] = await Promise.all([
  connection.getAccountInfo(position, "confirmed"),
  connection.getTokenAccountBalance(positionUsdc, "confirmed"),
  connection.getAccountInfo(positionAaplx, "confirmed"),
]);
if (!positionInfo) throw new Error("Position missing after setup");
if (BigInt(fundedUsdc.value.amount) !== INPUT_AMOUNT) {
  throw new Error("Position USDC funding postcondition failed");
}
if (!outputInfo) throw new Error("Position AAPLx token account missing");

const evidence = {
  schemaVersion: "covenant.stocklana-mainnet-canary-setup.v1",
  observedAt: new Date().toISOString(),
  network: { genesisHash, programId: PROGRAM_ID.toBase58() },
  operator: {
    publicKey: owner.publicKey.toBase58(),
    keypairPath,
  },
  position: position.toBase58(),
  covenantHash: covenantHashHex,
  input: {
    mint: USDC.toBase58(),
    ownerSourceTokenAccount: ownerUsdc.toBase58(),
    positionTokenAccount: positionUsdc.toBase58(),
    fundedRaw: INPUT_AMOUNT.toString(),
  },
  output: {
    mint: AAPLX.toBase58(),
    positionTokenAccount: positionAaplx.toBase58(),
  },
  transaction: {
    signature,
    explorer: explorerTx(signature),
    ownerSolSpentLamports: beforeSol - afterSol,
  },
  nextEnvironment: {
    COVENANT_MAINNET_POSITION: position.toBase58(),
    COVENANT_MAINNET_INPUT_TOKEN_ACCOUNT: positionUsdc.toBase58(),
    COVENANT_MAINNET_DESTINATION_TOKEN_ACCOUNT: positionAaplx.toBase58(),
  },
  truthBoundary:
    "REAL MAINNET SETUP: this transaction creates the bounded Position and token accounts and transfers the configured capped USDC amount into Position custody. It does not purchase AAPLx.",
};

await mkdir("evidence/mainnet-canary", { recursive: true });
const path =
  "evidence/mainnet-canary/setup-" +
  new Date().toISOString().replace(/[:.]/g, "-") +
  ".json";
await writeFile(path, JSON.stringify(evidence, null, 2) + "\n");

console.log(JSON.stringify(evidence, null, 2));
console.error("\nMAINNET CANARY SETUP: CONFIRMED");
console.error("Explorer: " + explorerTx(signature));
console.error("Evidence: " + path);
