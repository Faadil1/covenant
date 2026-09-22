import { mkdir, writeFile } from "node:fs/promises";
import { Connection, PublicKey } from "@solana/web3.js";
import { getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const EXPECTED = "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB";
const URL = "https://api.xstocks.fi/api/v2/public/assets/TSLAx";

const response = await fetch(URL);
const raw = await response.text();
if (!response.ok) throw new Error("xStocks API HTTP " + response.status + ": " + raw.slice(0,500));
const body = JSON.parse(raw);
const deployments = body.deployments || body.tokenDeployments || [];
const solana = deployments.find((d) => d.network === "Solana");
if (!solana?.address) throw new Error("Official xStocks API returned no Solana deployment for TSLAx");
if (solana.address !== EXPECTED) {
  throw new Error("Official TSLAx mint changed. Expected " + EXPECTED + ", got " + solana.address);
}

const connection = new Connection(RPC, "confirmed");
const account = await connection.getAccountInfo(new PublicKey(EXPECTED), "confirmed");
if (!account) throw new Error("TSLAx mint missing on Solana");
if (!account.owner.equals(TOKEN_2022_PROGRAM_ID)) {
  throw new Error("TSLAx is not owned by Token-2022");
}
const mint = await getMint(connection, new PublicKey(EXPECTED), "confirmed", TOKEN_2022_PROGRAM_ID);
const slot = await connection.getSlot("confirmed");

const out = {
  schemaVersion: "covenant.tsla-claim-verification.v1",
  observedAt: new Date().toISOString(),
  officialIssuerApi: {
    source: URL,
    id: body.id ?? null,
    name: body.name ?? null,
    symbol: body.symbol ?? null,
    underlying: body.underlying ?? null,
    solanaDeployment: solana,
  },
  onchain: {
    rpc: RPC,
    slot,
    mint: EXPECTED,
    ownerProgram: account.owner.toBase58(),
    decimals: mint.decimals,
  },
  status: "PASS",
};

await mkdir("evidence/tsla-fallback", { recursive: true });
const path = "evidence/tsla-fallback/claim-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
await writeFile(path, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
console.error("\nTSLA CLAIM VERIFICATION: PASS");
console.error("Evidence: " + path);
