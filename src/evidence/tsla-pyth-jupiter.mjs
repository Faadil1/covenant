import { trackingErrorBps } from "./pyth-pro.mjs";

function finitePositive(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(field + " must be positive");
  return n;
}

function earlierIso(a, b) {
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

export function buildTeslaPythJupiterMarketEvidence({
  pythEvidence,
  quote,
  inputUsd,
  tslaxDecimals = 8,
}) {
  const feed = pythEvidence?.feeds?.find(
    (item) => item.symbol === "Equity.US.TSLA/USD",
  );
  if (!feed) throw new Error("Missing Equity.US.TSLA/USD Pyth feed");
  if (!pythEvidence?.signedPayload?.sha256) {
    throw new Error("Missing signed Pyth payload hash");
  }

  const outRaw = finitePositive(quote?.outAmount, "quote.outAmount");
  const dollars = finitePositive(inputUsd, "inputUsd");
  const outputTokens = outRaw / 10 ** Number(tslaxDecimals);
  const executablePriceUsd = dollars / outputTokens;
  const priceImpactBps = Number(quote.priceImpactPct ?? 0) * 10_000;
  if (!Number.isFinite(priceImpactBps) || priceImpactBps < 0) {
    throw new Error("Invalid Jupiter price impact");
  }

  const quoteObservedAt = quote.observedAt || new Date().toISOString();
  const observedAt = earlierIso(feed.observedAt, quoteObservedAt);
  const pythSource =
    "Pyth Pro signed Solana payload sha256:" + pythEvidence.signedPayload.sha256;
  const routeSource = quote.source || "Jupiter quote";
  const combinedSource = pythSource + " + " + routeSource;

  const record = (value, source = combinedSource, at = observedAt) => ({
    value,
    status: "VERIFIED",
    evidenceClass: "LIVE_MARKET_OR_ORACLE",
    observedAt: at,
    source,
  });

  return {
    underlyingPriceUsd: record(feed.price, pythSource, feed.observedAt),
    representationPriceUsd: record(
      executablePriceUsd,
      routeSource,
      quoteObservedAt,
    ),
    trackingErrorBps: record(
      trackingErrorBps(executablePriceUsd, feed.price),
    ),
    pythConfidenceBps: record(
      feed.confidenceBps,
      pythSource,
      feed.observedAt,
    ),
    pythPublisherCount: record(
      feed.publisherCount,
      pythSource,
      feed.observedAt,
    ),
    pythPayloadSha256: {
      ...record(pythEvidence.signedPayload.sha256, pythSource, feed.observedAt),
      evidenceClass: "SIGNED_OR_AUTHORITATIVE_OFFCHAIN",
    },
    priceImpactBps: record(
      priceImpactBps,
      routeSource,
      quoteObservedAt,
    ),
    executionQuote: {
      inputUsd: dollars,
      outputRaw: String(quote.outAmount),
      outputTokens,
      impliedPriceUsd: executablePriceUsd,
      routeLabels: quote.routeLabels || [],
    },
  };
}
