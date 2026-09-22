import { readFile } from "node:fs/promises";
import { evaluateTransition } from "../src/policy/evaluator.mjs";
import { buildApplePythMarket, PYTH_APPLE_SYMBOLS } from "../src/market/pyth-apple.mjs";

const load = async (path) => JSON.parse(await readFile(path, "utf8"));
const covenant = await load("fixtures/apple-pyth-mainnet-canary-covenant.json");
const aaplx = await load("fixtures/passports/apple-aaplx.json");

const observedTimestampUs = 1790105400000000;
const market = buildApplePythMarket({
  reference: { price: 250, confidence: 0.05, timestampUs: observedTimestampUs },
  representation: { price: 249.5, confidence: 0.08, timestampUs: observedTimestampUs },
  representationSymbol: "AAPLx",
});

const result = evaluateTransition({
  covenant,
  passport: aaplx,
  market,
  portfolioPostState: {},
  authority: { allowedOperators: ["ACQUIRE"], maxAutonomousTransitionUsd: 10 },
  proposal: {
    positionId: "position:apple:mainnet-canary:01",
    operator: "ACQUIRE",
    amountUsd: 5,
  },
  now: new Date("2026-09-22T19:30:10.000Z"),
});

console.log(JSON.stringify({
  schemaVersion: "covenant.pyth-apple-demo.v1",
  mode: "DETERMINISTIC_FIXTURE_NOT_LIVE_PYTH",
  symbols: PYTH_APPLE_SYMBOLS,
  decision: result.decision,
  trackingErrorBps: market.trackingErrorBps.value,
  confidenceBps: market.confidenceBps.value,
  amountUsd: 5,
  canaryCapUsd: 10,
  truthBoundary: "This script validates Pyth-shaped market evidence semantics. Live signed Pyth ingestion and mainnet execution are separate gates.",
}, null, 2));
