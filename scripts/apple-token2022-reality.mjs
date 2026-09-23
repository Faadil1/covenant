import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  getExtensionTypes,
  unpackMint,
} from "@solana/spl-token";

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

const REPRESENTATIONS = [
  {
    id: "apple:xstocks:aaplx",
    symbol: "AAPLx",
    mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    issuer: "Backed Assets (JE) Limited",
  },
  {
    id: "apple:ondo:aaplon",
    symbol: "AAPLon",
    mint: "123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo",
    issuer: "Ondo",
  },
];

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function inspect(connection, representation) {
  const address = new PublicKey(representation.mint);
  const info = await connection.getAccountInfo(address, "confirmed");
  if (!info) throw new Error("Mint not found: " + representation.mint);

  if (!info.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error(
      representation.symbol +
        " is not owned by Token-2022: " +
        info.owner.toBase58(),
    );
  }

  const mint = unpackMint(address, info, TOKEN_2022_PROGRAM_ID);
  const extensionTypes = getExtensionTypes(mint.tlvData);
  const extensionNames = extensionTypes.map(
    (type) => ExtensionType[type] || "UNKNOWN_" + type,
  );

  return {
    ...representation,
    ownerProgram: info.owner.toBase58(),
    decimals: mint.decimals,
    supply: mint.supply.toString(),
    accountDataLength: info.data.length,
    extensionTypes,
    extensionNames,
    scaledUiAmountConfig:
      extensionTypes.includes(ExtensionType.ScaledUiAmountConfig),
  };
}

async function main() {
  const observedAt = new Date().toISOString();
  const connection = new Connection(RPC_URL, "confirmed");

  const records = [];
  for (const representation of REPRESENTATIONS) {
    records.push(await inspect(connection, representation));
  }

  const aaplx = records.find((record) => record.symbol === "AAPLx");
  const aaplon = records.find((record) => record.symbol === "AAPLon");

  const comparison = {
    property: "Token-2022 ScaledUiAmountConfig",
    aaplx: aaplx.scaledUiAmountConfig,
    aaplon: aaplon.scaledUiAmountConfig,
    objectiveDifference:
      aaplx.scaledUiAmountConfig !== aaplon.scaledUiAmountConfig,
    userMeaning:
      "Scaled UI mints require integrations to apply an issuer-controlled display multiplier when converting raw balances to displayed amounts. A representation without the extension does not have that exact integration dependency.",
  };

  const report = {
    schemaVersion: "covenant.apple-token2022-reality.v1",
    observedAt,
    rpcUrl: RPC_URL,
    sourceClass: "ONCHAIN_DETERMINISTIC",
    records,
    comparison,
  };

  const envelope = { ...report, reportHash: sha256(report) };
  await mkdir("evidence/apple-representation-reality", { recursive: true });
  const filename =
    "evidence/apple-representation-reality/runtime-" +
    observedAt.replace(/[:.]/g, "-") +
    ".json";
  await writeFile(filename, JSON.stringify(envelope, null, 2) + "\n");

  console.log(JSON.stringify(envelope, null, 2));
  console.error(
    "\nAPPLE TOKEN-2022 REALITY: " +
      (comparison.objectiveDifference ? "OBJECTIVE_DIFFERENCE_FOUND" : "NO_DIFFERENCE"),
  );
  console.error("Evidence: " + filename);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
