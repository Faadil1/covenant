import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  process.env.COVENANT_PROGRAM_ID ||
    "CEKUNCY7VYeHdwyyWCJTKQkGgMzPeTsx2uwBoQ98wm3z",
);
export const JUPITER_PROGRAM = new PublicKey(
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
);
export const USDC = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
);
export const AAPLX = new PublicKey(
  "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
);

export const OPERATOR_ACQUIRE = 0;
export const ACQUIRE_MASK = 1 << OPERATOR_ACQUIRE;

function hashBytes(value) {
  return createHash("sha256").update(value).digest();
}

export function anchorDiscriminator(name) {
  return hashBytes(Buffer.from("global:" + name)).subarray(0, 8);
}

export function fromHex32(value, field) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error(field + " must be a 32-byte hex digest");
  }
  return Buffer.from(value, "hex");
}

export function u16(value) {
  const out = Buffer.alloc(2);
  out.writeUInt16LE(Number(value));
  return out;
}

export function u32(value) {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(Number(value));
  return out;
}

export function u64(value) {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(BigInt(value));
  return out;
}

export function i64(value) {
  const out = Buffer.alloc(8);
  out.writeBigInt64LE(BigInt(value));
  return out;
}

export function vecBytes(value) {
  const bytes = Buffer.from(value);
  return Buffer.concat([u32(bytes.length), bytes]);
}

export function encodeInitialize({
  positionId,
  covenantHash,
  evaluator,
  maxUsdMicros,
  operatorMask,
}) {
  return Buffer.concat([
    anchorDiscriminator("initialize_position"),
    Buffer.from(positionId),
    Buffer.from(covenantHash),
    evaluator.toBuffer(),
    u64(maxUsdMicros),
    u16(operatorMask),
  ]);
}

export function encodeExecuteAppleAcquire({ proof, acquire }) {
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
    vecBytes(Buffer.from(acquire.swapAccountFlags)),
    vecBytes(acquire.swapData),
  ]);
}

export function decodePosition(data) {
  if (!data || data.length < 229) {
    throw new Error("Position account data too short");
  }
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

export function fixedMainnetPositionId() {
  return hashBytes(
    Buffer.from("COVENANT:APPLE:STOCKLANA:MAINNET:CANARY:V1"),
  );
}

export function derivePosition(owner) {
  const positionId = fixedMainnetPositionId();
  const [position] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), owner.toBuffer(), positionId],
    PROGRAM_ID,
  );
  return { position, positionId };
}

export async function loadLocalKeypair(pathValue) {
  const rawPath =
    pathValue ||
    process.env.SOLANA_KEYPAIR_PATH ||
    "~/.config/solana/id.json";
  const path = rawPath.startsWith("~/")
    ? resolve(homedir(), rawPath.slice(2))
    : resolve(rawPath);
  const raw = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(raw) || raw.length < 32) {
    throw new Error("Invalid Solana keypair file: " + path);
  }
  return { keypair: Keypair.fromSecretKey(Uint8Array.from(raw)), path };
}

export function rawInstruction(ix) {
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

export async function lookupTables(connection, build) {
  const addresses = Object.keys(build.addressesByLookupTableAddress || {});
  const tables = [];
  for (const address of addresses) {
    const key = new PublicKey(address);
    const fetched = await connection.getAddressLookupTable(key, {
      commitment: "confirmed",
    });
    if (!fetched.value) {
      throw new Error("Required Jupiter lookup table missing on mainnet: " + address);
    }
    tables.push(fetched.value);
  }
  return tables;
}

export async function tokenRawAmount(connection, tokenAccount) {
  const balance = await connection.getTokenAccountBalance(
    tokenAccount,
    "confirmed",
  );
  return BigInt(balance.value.amount);
}

export async function sendAndConfirmVersioned({
  connection,
  payer,
  signers = [],
  instructions,
  lookupTableAccounts = [],
}) {
  const latest = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: latest.blockhash,
    instructions,
  }).compileToV0Message(lookupTableAccounts);
  const transaction = new VersionedTransaction(message);
  const unique = new Map(
    [payer, ...signers].map((signer) => [signer.publicKey.toBase58(), signer]),
  );
  transaction.sign([...unique.values()]);

  const signature = await connection.sendTransaction(transaction, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
    maxRetries: 3,
  });
  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    "confirmed",
  );
  if (confirmation.value.err) {
    throw new Error(
      "Mainnet transaction failed: " + JSON.stringify(confirmation.value.err),
    );
  }
  return signature;
}

export async function assertMainnetProgram(connection) {
  const genesisHash = await connection.getGenesisHash();
  // Mainnet-beta genesis hash. Refuse a custom/dev/test cluster.
  if (genesisHash !== "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp") {
    throw new Error(
      "Refusing execution: RPC is not Solana mainnet-beta (genesis=" +
        genesisHash +
        ")",
    );
  }
  const account = await connection.getAccountInfo(PROGRAM_ID, "confirmed");
  if (!account?.executable) {
    throw new Error(
      "COVENANT program is not deployed/executable on mainnet at " +
        PROGRAM_ID.toBase58(),
    );
  }
  return { genesisHash, programAccount: account };
}

export function mainnetConnection() {
  const rpc =
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  return new Connection(rpc, "confirmed");
}

export function explorerTx(signature) {
  return "https://explorer.solana.com/tx/" + signature;
}
