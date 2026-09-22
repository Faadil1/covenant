import { mkdir, readFile, writeFile } from "node:fs/promises";
import { evaluateTransition } from "../src/policy/evaluator.mjs";
import { sha256Canonical } from "../src/proof/transition-proof.mjs";
import {
  buildApplePythMarketEvidence,
  fetchPythStocklanaEvidence,
  PYTH_STOCKLANA_SYMBOLS,
} from "../src/evidence/pyth-pro.mjs";

const covenant = JSON.parse(
  await readFile("fixtures/apple-mainnet-canary-covenant.json", "utf8"),
);
const passport = JSON.parse(
  await readFile("fixtures/passports/apple-aaplx.json", "utf8"),
);

const evidence = await fetchPythStocklanaEvidence();
const market = buildApplePythMarketEvidence(
  evidence,
  PYTH_STOCKLANA_SYMBOLS.AAPLX,
);

// This script isolates Pyth semantics from Jupiter. A mainnet preflight adds
// the exact live route-impact record before asking the same evaluator to ALLOW.
market.priceImpactBps = {
  value: 0,
  status: "VERIFIED",
  evidenceClass: "LIVE_MARKET_OR_ORACLE",
  observedAt: market.trackingErrorBps.observedAt,
  source: "PYTH_ONLY_EVIDENCE_PROBE_PLACEHOLDER_FOR_JUPITER_PREFLIGHT",
};

const evaluation = evaluateTransition({
  covenant,
  passport,
  market,
  portfolioPostState: {},
  authority: {
    allowedOperators: ["ACQUIRE"],
    maxAutonomousTransitionUsd: 5,
  },
  proposal: {
    positionId: "position:apple:stocklana-mainnet-canary",
    operator: "ACQUIRE",
    amountUsd: 5,
  },
  now: new Date(),
});

const output = {
  schemaVersion: "covenant.pyth-stocklana-gate.v1",
  observedAt: new Date().toISOString(),
  pyth: {
    symbols: evidence.requestedFeeds,
    channel: evidence.channel,
    signedPayloadSha256: evidence.signedPayload.sha256,
    signedPayloadByteLength: evidence.signedPayload.byteLength,
    feeds: evidence.feeds.map(({ symbol, id, price, confidenceBps, publisherCount, marketSession, observedAt }) => ({
      symbol,
      id,
      price,
      confidenceBps,
      publisherCount,
      marketSession,
      observedAt,
    })),
  },
  market: {
    trackingErrorBps: market.trackingErrorBps.value,
    confidenceBps: market.pythConfidenceBps.value,
    publisherCount: market.pythPublisherCount.value,
  },
  covenantHash: sha256Canonical(covenant),
  decisionWithoutJupiterRoute: evaluation.decision,
  ruleResults: evaluation.ruleResults,
  truthBoundary:
    "Pyth live signed evidence is real and policy-relevant. This probe does not authorize or submit a Solana transaction; the mainnet canary preflight must additionally bind the live Jupiter route.",
};

await mkdir("evidence/pyth", { recursive: true });
const path =
  "evidence/pyth/stocklana-" +
  new Date().toISOString().replace(/[:.]/g, "-") +
  ".json";
await writeFile(path, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output, null, 2));
console.error("\nPYTH STOCKLANA EVIDENCE: " + evaluation.decision);
console.error("Evidence: " + path);
