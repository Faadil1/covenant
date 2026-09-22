import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const QUOTE = process.env.JUPITER_QUOTE_URL || "https://lite-api.jup.ag/swap/v1/quote";
const AAPLX = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";
const AAPLON = "123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo";
const SOURCE_AMOUNTS = [
  { label: "~$3 AAPLon", raw: 10_000_000n },
  { label: "~$10 AAPLon", raw: 30_000_000n },
  { label: "~$25 AAPLon", raw: 75_000_000n },
  { label: "~$50 AAPLon", raw: 150_000_000n },
];

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function quote(inputMint, outputMint, amount) {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: String(amount),
    slippageBps: "50",
    restrictIntermediateTokens: "true",
  });
  const url = QUOTE + "?" + params.toString();
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    return { status: "UNKNOWN", source: url, error: "HTTP " + response.status + ": " + text.slice(0, 400) };
  }
  const body = JSON.parse(text);
  return {
    status: "VERIFIED",
    source: url,
    inAmount: body.inAmount,
    outAmount: body.outAmount,
    minOut: body.otherAmountThreshold,
    priceImpactPct: body.priceImpactPct,
    priceImpactBps: body.priceImpactPct == null ? null : Number(body.priceImpactPct) * 10000,
    routeLabels: (body.routePlan || []).map((x) => x.swapInfo?.label).filter(Boolean),
    contextSlot: body.contextSlot ?? null,
  };
}

async function main() {
  const observedAt = new Date().toISOString();
  const forward = [];
  for (const item of SOURCE_AMOUNTS) {
    forward.push({
      ...item,
      raw: item.raw.toString(),
      ...(await quote(AAPLON, AAPLX, item.raw)),
    });
  }

  const reverse = [];
  for (const raw of [1_000_000n, 3_000_000n, 7_500_000n, 15_000_000n]) {
    reverse.push({
      raw: raw.toString(),
      ...(await quote(AAPLX, AAPLON, raw)),
    });
  }

  const report = {
    schemaVersion: "covenant.t4-migration-route-probe.v1",
    observedAt,
    underlyingIntent: "APPLE economic exposure",
    purpose: "Determine whether a truthful direct AAPLon -> AAPLx self-healing migration route is currently executable on Solana secondary liquidity.",
    forward: {
      inputClaim: { symbol: "AAPLon", mint: AAPLON, decimals: 9 },
      outputClaim: { symbol: "AAPLx", mint: AAPLX, decimals: 8 },
      quotes: forward,
    },
    reverse: {
      inputClaim: { symbol: "AAPLx", mint: AAPLX, decimals: 8 },
      outputClaim: { symbol: "AAPLon", mint: AAPLON, decimals: 9 },
      quotes: reverse,
    },
  };
  const envelope = { ...report, reportHash: sha256(report) };
  await mkdir("evidence/t4", { recursive: true });
  const path = "evidence/t4/migration-route-" + observedAt.replace(/[:.]/g, "-") + ".json";
  await writeFile(path, JSON.stringify(envelope, null, 2) + "\n");
  console.log(JSON.stringify(envelope, null, 2));
  console.error("\nCOVENANT T4 MIGRATION ROUTE PROBE: COMPLETE");
  console.error("Evidence: " + path);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
