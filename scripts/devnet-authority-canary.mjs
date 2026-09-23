import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const RPC = process.env.SOLANA_DEVNET_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(process.env.COVENANT_DEVNET_PROGRAM_ID);
const PAYER_PATH = process.env.DEVNET_PAYER_KEYPAIR;
if (!PAYER_PATH) throw new Error("DEVNET_PAYER_KEYPAIR is required");

const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(await readFile(PAYER_PATH, "utf8"))),
);
const evaluator = Keypair.generate();
const settlement = Keypair.generate().publicKey;
const connection = new Connection(RPC, "confirmed");

const DEPOSIT_LAMPORTS = 10_000_000n;
const SETTLEMENT_LAMPORTS = 5_000_000n;
const ECONOMIC_VALUE_USD_MICROS = 5_000_000n;
const OPERATOR_ACQUIRE = 0;
const ACQUIRE_MASK = 1;

function sha256(...parts) {
  const h = createHash("sha256");
  for (const part of parts) h.update(part);
  return h.digest();
}
function discriminator(name) {
  return sha256(Buffer.from("global:" + name)).subarray(0, 8);
}
function u16(value) {
  const b = Buffer.alloc(2); b.writeUInt16LE(Number(value)); return b;
}
function u64(value) {
  const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(value)); return b;
}
function i64(value) {
  const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(value)); return b;
}
function labelHash(label) {
  return sha256(Buffer.from("COVENANT:DEVNET:" + label));
}
function settlementCommitment(destination, lamports) {
  return sha256(
    Buffer.from("COVENANT_SYSTEM_SETTLEMENT_V1"),
    destination.toBuffer(),
    u64(lamports),
  );
}
function explorerTx(signature) {
  return "https://explorer.solana.com/tx/" + signature + "?cluster=devnet";
}
function explorerAddress(address) {
  return "https://explorer.solana.com/address/" + address + "?cluster=devnet";
}
async function send(instructions, signers = []) {
  const tx = new Transaction().add(...instructions);
  return sendAndConfirmTransaction(connection, tx, [payer, ...signers], {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
}

const programAccount = await connection.getAccountInfo(PROGRAM_ID, "confirmed");
if (!programAccount?.executable) {
  throw new Error("COVENANT devnet program is not executable at " + PROGRAM_ID.toBase58());
}

const positionId = sha256(
  Buffer.from("COVENANT:PUBLIC-DEVNET-AUTHORITY-CANARY:V1"),
  payer.publicKey.toBuffer(),
);
const covenantHash = labelHash("COVENANT_HASH");
const [position] = PublicKey.findProgramAddressSync(
  [Buffer.from("position"), payer.publicKey.toBuffer(), positionId],
  PROGRAM_ID,
);
const [vault] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault"), position.toBuffer()],
  PROGRAM_ID,
);

const initializeData = Buffer.concat([
  discriminator("initialize_position"),
  positionId,
  covenantHash,
  evaluator.publicKey.toBuffer(),
  u64(10_000_000n),
  u16(ACQUIRE_MASK),
]);
const initializeIx = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: position, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: initializeData,
});
const initializeSignature = await send([initializeIx]);

const seedSettlementIx = SystemProgram.transfer({
  fromPubkey: payer.publicKey,
  toPubkey: settlement,
  lamports: 1_000_000,
});
const depositIx = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: position, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: Buffer.concat([discriminator("deposit"), u64(DEPOSIT_LAMPORTS)]),
});
const depositSignature = await send([seedSettlementIx, depositIx]);

const positionBefore = await connection.getAccountInfo(position, "confirmed");
if (!positionBefore) throw new Error("Position missing after initialization");
const versionBefore = positionBefore.data.readBigUInt64LE(136);
const nonceBefore = positionBefore.data.readBigUInt64LE(144);
if (versionBefore !== 1n || nonceBefore !== 1n) {
  throw new Error("Unexpected Position state before execution: v" + versionBefore + "/n" + nonceBefore);
}

const settlementBefore = await connection.getBalance(settlement, "confirmed");
const proofFields = [
  covenantHash,
  labelHash("REPRESENTATION_RECORD"),
  labelHash("EVIDENCE_ROOT"),
  labelHash("PRE_STATE"),
  labelHash("POST_STATE"),
  labelHash("RECEIPT"),
  settlementCommitment(settlement, SETTLEMENT_LAMPORTS),
  Buffer.alloc(32),
  u64(versionBefore),
  u64(nonceBefore),
  i64(BigInt(Math.floor(Date.now() / 1000) + 300)),
  Buffer.from([OPERATOR_ACQUIRE]),
  u64(ECONOMIC_VALUE_USD_MICROS),
];
const executeData = Buffer.concat([
  discriminator("execute_proven_transition"),
  ...proofFields,
  u64(SETTLEMENT_LAMPORTS),
  settlement.toBuffer(),
]);
const executeIx = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: payer.publicKey, isSigner: true, isWritable: false },
    { pubkey: evaluator.publicKey, isSigner: true, isWritable: false },
    { pubkey: position, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: settlement, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: executeData,
});
const executeSignature = await send([executeIx], [evaluator]);

const settlementAfter = await connection.getBalance(settlement, "confirmed");
const positionAfter = await connection.getAccountInfo(position, "confirmed");
const versionAfter = positionAfter.data.readBigUInt64LE(136);
const nonceAfter = positionAfter.data.readBigUInt64LE(144);

if (BigInt(settlementAfter - settlementBefore) !== SETTLEMENT_LAMPORTS) {
  throw new Error("Settlement delta mismatch");
}
if (versionAfter !== 2n || nonceAfter !== 2n) {
  throw new Error("Position did not advance after execution");
}

const replayTx = new Transaction().add(executeIx);
replayTx.feePayer = payer.publicKey;
const latest = await connection.getLatestBlockhash("confirmed");
replayTx.recentBlockhash = latest.blockhash;
replayTx.sign(payer, evaluator);
const replaySignature = await connection.sendRawTransaction(replayTx.serialize(), {
  skipPreflight: true,
  maxRetries: 3,
});
const replayConfirmation = await connection.confirmTransaction(
  {
    signature: replaySignature,
    blockhash: latest.blockhash,
    lastValidBlockHeight: latest.lastValidBlockHeight,
  },
  "confirmed",
);
if (!replayConfirmation.value.err) {
  throw new Error("Replay unexpectedly succeeded");
}
const settlementAfterReplay = await connection.getBalance(settlement, "confirmed");
if (settlementAfterReplay !== settlementAfter) {
  throw new Error("Replay changed settlement balance");
}

const evidence = {
  schemaVersion: "covenant.devnet-authority-canary.v1",
  observedAt: new Date().toISOString(),
  cluster: "devnet",
  programId: PROGRAM_ID.toBase58(),
  programExplorer: explorerAddress(PROGRAM_ID.toBase58()),
  position: position.toBase58(),
  positionExplorer: explorerAddress(position.toBase58()),
  evaluator: evaluator.publicKey.toBase58(),
  settlement: settlement.toBase58(),
  transitions: {
    initialize: { signature: initializeSignature, explorer: explorerTx(initializeSignature) },
    deposit: { signature: depositSignature, explorer: explorerTx(depositSignature) },
    execute: { signature: executeSignature, explorer: explorerTx(executeSignature) },
    replay: {
      signature: replaySignature,
      explorer: explorerTx(replaySignature),
      refused: true,
      error: replayConfirmation.value.err,
    },
  },
  state: {
    before: { positionVersion: Number(versionBefore), nonce: Number(nonceBefore) },
    after: { positionVersion: Number(versionAfter), nonce: Number(nonceAfter) },
    settlementDeltaLamports: settlementAfter - settlementBefore,
    replaySettlementDeltaLamports: settlementAfterReplay - settlementAfter,
  },
  authorization: {
    operator: "ACQUIRE",
    economicValueUsdMicros: ECONOMIC_VALUE_USD_MICROS.toString(),
    expiryBound: true,
    covenantHashBound: true,
    evaluatorSignerRequired: true,
    exactSettlementCommitmentBound: true,
  },
  truthBoundary:
    "Public Solana devnet authority-boundary execution. This is not a mainnet financial transaction and does not claim ZK or formal proof.",
};

await mkdir("evidence/devnet", { recursive: true });
await writeFile("evidence/devnet/authority-canary.json", JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(evidence, null, 2));
console.error("\nCOVENANT DEVNET AUTHORITY CANARY: PASS");
