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
const state = Keypair.generate();
const connection = new Connection(RPC, "confirmed");

const STATE_LEN = 81;
const FUNDING_LAMPORTS = 10_000_000;
const SETTLEMENT_LAMPORTS = 5_000_000;
const DOMAIN = Buffer.from("COVENANT_CANARY_AUTH_V1");

const sha256 = (...parts) => {
  const h = createHash("sha256");
  for (const part of parts) h.update(part);
  return h.digest();
};
const u64 = (value) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(value));
  return b;
};
const i64 = (value) => {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(value));
  return b;
};
const explorerTx = (sig) => "https://explorer.solana.com/tx/" + sig + "?cluster=devnet";
const explorerAddress = (address) => "https://explorer.solana.com/address/" + address + "?cluster=devnet";

async function send(instructions, signers = []) {
  const tx = new Transaction().add(...instructions);
  return sendAndConfirmTransaction(connection, tx, [payer, ...signers], {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
}

const programAccount = await connection.getAccountInfo(PROGRAM_ID, "confirmed");
if (!programAccount?.executable) {
  throw new Error("Canary program is not executable on devnet");
}

const rent = await connection.getMinimumBalanceForRentExemption(STATE_LEN);
const createState = SystemProgram.createAccount({
  fromPubkey: payer.publicKey,
  newAccountPubkey: state.publicKey,
  lamports: rent + FUNDING_LAMPORTS,
  space: STATE_LEN,
  programId: PROGRAM_ID,
});
const createStateSignature = await send([createState], [state]);

const covenantHash = sha256(Buffer.from("COVENANT:DEVNET:CANARY:POLICY:V1"));
const maxLamports = SETTLEMENT_LAMPORTS;
const initializeIx = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: state.publicKey, isSigner: false, isWritable: true },
    { pubkey: payer.publicKey, isSigner: true, isWritable: false },
    { pubkey: evaluator.publicKey, isSigner: false, isWritable: false },
  ],
  data: Buffer.concat([
    Buffer.from([0]),
    covenantHash,
    u64(maxLamports),
  ]),
});
const initializeSignature = await send([initializeIx]);

const expiryUnix = BigInt(Math.floor(Date.now() / 1000) + 300);
const nonce = 0n;
const commitment = sha256(
  DOMAIN,
  covenantHash,
  payer.publicKey.toBuffer(),
  u64(nonce),
  u64(SETTLEMENT_LAMPORTS),
  i64(expiryUnix),
);
const executeData = Buffer.concat([
  Buffer.from([1]),
  u64(nonce),
  u64(SETTLEMENT_LAMPORTS),
  i64(expiryUnix),
  commitment,
]);
const executeIx = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: state.publicKey, isSigner: false, isWritable: true },
    { pubkey: evaluator.publicKey, isSigner: true, isWritable: false },
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
  ],
  data: executeData,
});

const stateBefore = await connection.getBalance(state.publicKey, "confirmed");
const executeSignature = await send([executeIx], [evaluator]);
const stateAfter = await connection.getBalance(state.publicKey, "confirmed");
if (stateBefore - stateAfter !== SETTLEMENT_LAMPORTS) {
  throw new Error("Program-controlled settlement delta mismatch");
}

const stateInfoAfter = await connection.getAccountInfo(state.publicKey, "confirmed");
const nonceAfter = stateInfoAfter.data.readBigUInt64LE(1);
if (nonceAfter !== 1n) throw new Error("Nonce did not advance");

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
const stateAfterReplay = await connection.getBalance(state.publicKey, "confirmed");
if (stateAfterReplay !== stateAfter) {
  throw new Error("Replay changed program-controlled balance");
}

const evidence = {
  schemaVersion: "covenant.devnet-authority-canary.v2",
  observedAt: new Date().toISOString(),
  cluster: "devnet",
  scope: "minimal authority-boundary canary; not the full COVENANT runtime",
  programId: PROGRAM_ID.toBase58(),
  programExplorer: explorerAddress(PROGRAM_ID.toBase58()),
  stateAccount: state.publicKey.toBase58(),
  stateExplorer: explorerAddress(state.publicKey.toBase58()),
  evaluator: evaluator.publicKey.toBase58(),
  authorization: {
    nonceBefore: "0",
    nonceAfter: nonceAfter.toString(),
    maxLamports: maxLamports.toString(),
    settledLamports: SETTLEMENT_LAMPORTS.toString(),
    expiryUnix: expiryUnix.toString(),
    covenantHash: covenantHash.toString("hex"),
    exactCommitment: commitment.toString("hex"),
  },
  transactions: {
    createState: { signature: createStateSignature, explorer: explorerTx(createStateSignature) },
    initialize: { signature: initializeSignature, explorer: explorerTx(initializeSignature) },
    execute: { signature: executeSignature, explorer: explorerTx(executeSignature) },
    replay: {
      signature: replaySignature,
      explorer: explorerTx(replaySignature),
      refused: true,
      error: replayConfirmation.value.err,
    },
  },
  stateLamports: {
    before: stateBefore,
    after: stateAfter,
    afterReplay: stateAfterReplay,
  },
  truthBoundary:
    "Public Solana devnet canary for evaluator-bound, exact-commitment, nonce-protected authority. Not mainnet, not a token swap, and not a ZK/formal proof.",
};

await mkdir("evidence/devnet", { recursive: true });
await writeFile("evidence/devnet/authority-canary.json", JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(evidence, null, 2));
console.error("\nCOVENANT MINIMAL DEVNET CANARY: PASS");
