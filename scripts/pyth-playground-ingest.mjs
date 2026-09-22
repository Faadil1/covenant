import { readFile } from "node:fs/promises";
import { evaluateTransition } from "../src/policy/evaluator.mjs";
import { sha256Canonical } from "../src/proof/transition-proof.mjs";
import {
  buildApplePythMarketEvidence,
  parsePythLatestResponse,
  PYTH_STOCKLANA_SYMBOLS,
} from "../src/evidence/pyth-pro.mjs";

const path = process.argv[2] || "playground-pyth.json";
const raw = JSON.parse(await readFile(path, "utf8"));
const message = raw?.value ?? raw?.message?.value ?? raw;

const requestedFeeds = [
  { symbol: PYTH_STOCKLANA_SYMBOLS.AAPL, id: 922 },
  { symbol: PYTH_STOCKLANA_SYMBOLS.AAPLX, id: 1792 },
  { symbol: PYTH_STOCKLANA_SYMBOLS.AAPLON, id: 3132 },
];

const parsed = parsePythLatestResponse(message, requestedFeeds);
const evidence = {
  ...parsed,
  requestedFeeds,
  channel: "PLAYGROUND_SHARED_DEMO_TOKEN",
};

const covenant = JSON.parse(
  await readFile("fixtures/apple-mainnet-canary-covenant.json", "utf8"),
);
const passport = JSON.parse(
  await readFile("fixtures/passports/apple-aaplx.json", "utf8"),
);

const market = buildApplePythMarketEvidence(
  evidence,
  PYTH_STOCKLANA_SYMBOLS.AAPLX,
);

// Playground proves Pyth semantics only. Jupiter remains a separate live gate.
market.priceImpactBps = {
  value: 0,
  status: "VERIFIED",
  evidenceClass: "LIVE_MARKET_OR_ORACLE",
  observedAt: market.trackingErrorBps.observedAt,
  source: "PLAYGROUND_ONLY_PLACEHOLDER_FOR_JUPITER_PREFLIGHT",
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
    positionId: "position:apple:stocklana-playground",
    operator: "ACQUIRE",
    amountUsd: 5,
  },
  now: new Date(parsed.observedAt),
});

console.log(JSON.stringify({
  schemaVersion: "covenant.pyth-playground-import.v1",
  sourceFile: path,
  source: "Pyth Pro Playground shared demo token",
  symbols: requestedFeeds,
  signedPayloadSha256: parsed.signedPayload.sha256,
  signedPayloadByteLength: parsed.signedPayload.byteLength,
  feeds: parsed.feeds.map((f) => ({
    symbol: f.symbol,
    id: f.id,
    price: f.price,
    confidenceBps: f.confidenceBps,
    publisherCount: f.publisherCount,
    marketSession: f.marketSession,
    observedAt: f.observedAt,
  })),
  market: {
    trackingErrorBps: market.trackingErrorBps.value,
    confidenceBps: market.pythConfidenceBps.value,
    publisherCount: market.pythPublisherCount.value,
  },
  covenantHash: sha256Canonical(covenant),
  decisionAtPayloadTime: evaluation.decision,
  ruleResults: evaluation.ruleResults,
  mainnetEligible: false,
  truthBoundary:
    "This imports one signed Pyth Playground message into the real COVENANT evaluator. It proves Pyth data can drive policy, but it is not the automated fresh-data mainnet path and must not be used to claim a live mainnet authorization.",
}, null, 2));
