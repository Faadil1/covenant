const abs = Math.abs;

export const PYTH_APPLE_SYMBOLS = Object.freeze({
  underlying: "Equity.US.AAPL/USD",
  AAPLx: "Crypto.AAPLX/USD",
  AAPLon: "Crypto.AAPLON/USD",
});

function finitePositive(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label} must be a positive finite number`);
  return n;
}

function observedAtFromMicros(timestampUs) {
  const micros = Number(timestampUs);
  if (!Number.isFinite(micros) || micros <= 0) throw new Error("timestampUs must be positive");
  return new Date(Math.floor(micros / 1000)).toISOString();
}

export function trackingErrorBps(referencePrice, representationPrice) {
  const reference = finitePositive(referencePrice, "referencePrice");
  const representation = finitePositive(representationPrice, "representationPrice");
  return abs((representation - reference) / reference) * 10_000;
}

export function confidenceBps(price, confidence) {
  const p = finitePositive(price, "price");
  const c = Number(confidence);
  if (!Number.isFinite(c) || c < 0) throw new Error("confidence must be a non-negative finite number");
  return (c / p) * 10_000;
}

export function buildApplePythMarket({
  reference,
  representation,
  representationSymbol,
  source = "PYTH_PRO",
}) {
  if (!reference || !representation) throw new Error("reference and representation price records are required");
  if (!["AAPLx", "AAPLon"].includes(representationSymbol)) {
    throw new Error("representationSymbol must be AAPLx or AAPLon");
  }

  const referencePrice = finitePositive(reference.price, "reference.price");
  const representationPrice = finitePositive(representation.price, "representation.price");
  const observedAt = observedAtFromMicros(
    Math.min(Number(reference.timestampUs), Number(representation.timestampUs)),
  );

  return {
    source: {
      value: source,
      status: "VERIFIED",
      evidenceClass: "LIVE_MARKET_OR_ORACLE",
      observedAt,
      source: "Pyth Pro signed price payload",
    },
    referenceSymbol: {
      value: PYTH_APPLE_SYMBOLS.underlying,
      status: "VERIFIED",
      evidenceClass: "LIVE_MARKET_OR_ORACLE",
      observedAt,
      source: "Pyth Pro",
    },
    representationSymbol: {
      value: PYTH_APPLE_SYMBOLS[representationSymbol],
      status: "VERIFIED",
      evidenceClass: "LIVE_MARKET_OR_ORACLE",
      observedAt,
      source: "Pyth Pro",
    },
    referencePrice: {
      value: referencePrice,
      status: "VERIFIED",
      evidenceClass: "LIVE_MARKET_OR_ORACLE",
      observedAt,
      source: "Pyth Pro",
    },
    representationPrice: {
      value: representationPrice,
      status: "VERIFIED",
      evidenceClass: "LIVE_MARKET_OR_ORACLE",
      observedAt,
      source: "Pyth Pro",
    },
    trackingErrorBps: {
      value: trackingErrorBps(referencePrice, representationPrice),
      status: "VERIFIED",
      evidenceClass: "LIVE_MARKET_OR_ORACLE",
      observedAt,
      source: "Pyth Pro",
    },
    confidenceBps: {
      value: Math.max(
        confidenceBps(referencePrice, reference.confidence ?? 0),
        confidenceBps(representationPrice, representation.confidence ?? 0),
      ),
      status: "VERIFIED",
      evidenceClass: "LIVE_MARKET_OR_ORACLE",
      observedAt,
      source: "Pyth Pro",
    },
  };
}
