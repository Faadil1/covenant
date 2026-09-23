import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  getExtensionTypes,
  getPermanentDelegate,
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

  const permanentDelegateRecord = getPermanentDelegate(mint);
  const permanentDelegateAddress =
    permanentDelegateRecord?.delegate &&
    typeof permanentDelegateRecord.delegate.toBase58 === "function"
      ? permanentDelegateRecord.delegate.toBase58()
      : permanentDelegateRecord?.delegate
        ? String(permanentDelegateRecord.delegate)
        : null;
  const permanentDelegateActive =
    Boolean(permanentDelegateAddress) &&
    permanentDelegateAddress !== PublicKey.default.toBase58();

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
    permanentDelegateExtension:
      extensionTypes.includes(ExtensionType.PermanentDelegate),
    permanentDelegateAddress,
    permanentDelegateActive,
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
    property: "Active Token-2022 PermanentDelegate",
    aaplx: aaplx.permanentDelegateActive,
    aaplon: aaplon.permanentDelegateActive,
    objectiveDifference:
      aaplx.permanentDelegateActive !== aaplon.permanentDelegateActive,
    userMeaning:
      "Under Solana Token-2022, an active permanent delegate is a mint-level authority that can authorize transfers and burns for any token account of that mint, and token-account owners cannot revoke it.",
    semanticsSource:
      "https://solana.com/docs/tokens/extensions/permanent-delegate",
    secondaryObservation: {
      property: "ScaledUiAmountConfig",
      aaplx: aaplx.scaledUiAmountConfig,
      aaplon: aaplon.scaledUiAmountConfig,
      objectiveDifference:
        aaplx.scaledUiAmountConfig !== aaplon.scaledUiAmountConfig,
    },
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
