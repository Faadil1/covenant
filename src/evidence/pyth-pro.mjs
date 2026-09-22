import { createHash } from "node:crypto";

export const PYTH_STOCKLANA_SYMBOLS = Object.freeze({
  AAPL: "Equity.US.AAPL/USD",
  AAPLX: "Crypto.AAPLX/USD",
  AAPLON: "Crypto.AAPLON/USD",
});

export const PYTH_PRO_API = "https://pyth-lazer.dourolabs.app";
export const PYTH_SYMBOLS_API = "https://pyth.dourolabs.app/v1/symbols";

function asNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("Invalid Pyth " + field);
  return number;
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function decimalPrice(feed) {
  const price = asNumber(feed.price, "price");
  const exponent = asNumber(feed.exponent, "exponent");
  return price * 10 ** exponent;
}

export function confidenceBps(feed) {
  const price = Math.abs(asNumber(feed.price, "price"));
  const confidence = Math.abs(asNumber(feed.confidence ?? 0, "confidence"));
  if (price === 0) throw new Error("Pyth price cannot be zero");
  return (confidence / price) * 10_000;
}

export function trackingErrorBps(representationPrice, underlyingPrice) {
  const underlying = Number(underlyingPrice);
  const representation = Number(representationPrice);
  if (!Number.isFinite(underlying) || underlying <= 0) {
    throw new Error("Underlying price must be positive");
  }
  if (!Number.isFinite(representation) || representation <= 0) {
    throw new Error("Representation price must be positive");
  }
  return Math.abs(representation - underlying) / underlying * 10_000;
}

export function pythTimestampToIso(timestampUs) {
  const micros = BigInt(timestampUs);
  return new Date(Number(micros / 1000n)).toISOString();
}

export function parsePythLatestResponse(payload, requestedFeeds) {
  const parsed = payload?.parsed ?? payload?.data?.parsed ?? payload;
  const timestampUs = parsed?.timestampUs ?? parsed?.timestamp_us;
  const feeds = parsed?.priceFeeds ?? parsed?.price_feeds ?? [];
  if (!timestampUs || !Array.isArray(feeds) || feeds.length === 0) {
    throw new Error("Pyth latest-price response missing parsed price feeds");
  }

  const requestedById = new Map(
    requestedFeeds.map((item) => [Number(item.id), item.symbol]),
  );
  const normalized = feeds.map((feed) => {
    const id = Number(feed.priceFeedId ?? feed.price_feed_id);
    const symbol = requestedById.get(id);
    if (!symbol) throw new Error("Unexpected Pyth feed id " + id);
    const price = decimalPrice(feed);
    return {
      id,
      symbol,
      price,
      rawPrice: String(feed.price),
      exponent: Number(feed.exponent),
      confidenceRaw: String(feed.confidence ?? 0),
      confidenceBps: confidenceBps(feed),
      publisherCount: Number(feed.publisherCount ?? feed.publisher_count ?? 0),
      marketSession: feed.marketSession ?? feed.market_session ?? null,
      feedUpdateTimestampUs: String(
        feed.feedUpdateTimestamp ?? feed.feed_update_timestamp ?? timestampUs,
      ),
      observedAt: pythTimestampToIso(
        feed.feedUpdateTimestamp ?? feed.feed_update_timestamp ?? timestampUs,
      ),
    };
  });

  const solana = payload?.solana ?? payload?.data?.solana ?? null;
  if (!solana?.data || !solana.encoding) {
    throw new Error("Pyth response missing signed Solana payload");
  }
  const encoding = solana.encoding === "hex" ? "hex" : "base64";
  const payloadBytes = Buffer.from(
    String(solana.data).replace(/^0x/, ""),
    encoding,
  );

  return {
    schemaVersion: "covenant.pyth-stocklana-evidence.v1",
    timestampUs: String(timestampUs),
    observedAt: pythTimestampToIso(timestampUs),
    feeds: normalized,
    signedPayload: {
      format: "solana",
      encoding,
      byteLength: payloadBytes.length,
      sha256: sha256Hex(payloadBytes),
      data: solana.data,
    },
  };
}

export async function discoverPythFeeds({
  symbols = Object.values(PYTH_STOCKLANA_SYMBOLS),
  symbolsApi = PYTH_SYMBOLS_API,
} = {}) {
  const url = new URL(symbolsApi);
  url.searchParams.set("query", "AAPL");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Pyth symbol discovery failed: HTTP " + response.status);
  }
  const json = await response.json();
  const rows = Array.isArray(json) ? json : json?.data ?? json?.symbols ?? [];
  const bySymbol = new Map(rows.map((row) => [row.symbol, row]));

  return symbols.map((symbol) => {
    const row = bySymbol.get(symbol);
    if (!row) throw new Error("Required Pyth feed not found: " + symbol);
    const id = Number(
      row.pyth_lazer_id ?? row.pythLazerId ?? row.price_feed_id ?? row.id,
    );
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("Pyth feed has invalid numeric id: " + symbol);
    }
    return {
      symbol,
      id,
      exponent: Number(row.exponent),
      minChannel: row.min_channel ?? row.minChannel ?? null,
    };
  });
}

export async function fetchPythStocklanaEvidence({
  apiKey = process.env.PYTH_API_KEY,
  apiBase = process.env.PYTH_PRO_API_BASE || PYTH_PRO_API,
  channel = process.env.PYTH_CHANNEL || "fixed_rate@200ms",
} = {}) {
  if (!apiKey) throw new Error("PYTH_API_KEY is required");

  const requestedFeeds = await discoverPythFeeds();
  const response = await fetch(apiBase + "/v1/latest_price", {
    method: "POST",
    headers: {
      authorization: "Bearer " + apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      priceFeedIds: requestedFeeds.map((item) => item.id),
      properties: [
        "price",
        "confidence",
        "exponent",
        "publisherCount",
        "marketSession",
        "feedUpdateTimestamp",
      ],
      formats: ["solana"],
      channel,
      ignoreInvalidFeeds: false,
      jsonBinaryEncoding: "base64",
    }),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(
      "Pyth latest-price failed: HTTP " + response.status + " " + raw.slice(0, 800),
    );
  }
  const parsed = parsePythLatestResponse(JSON.parse(raw), requestedFeeds);
  return { ...parsed, requestedFeeds, channel };
}

export function buildApplePythMarketEvidence(pythEvidence, representationSymbol) {
  const bySymbol = new Map(pythEvidence.feeds.map((feed) => [feed.symbol, feed]));
  const underlying = bySymbol.get(PYTH_STOCKLANA_SYMBOLS.AAPL);
  const representation = bySymbol.get(representationSymbol);
  if (!underlying || !representation) {
    throw new Error("Missing Pyth underlying or representation feed");
  }

  const observedAt =
    Date.parse(underlying.observedAt) <= Date.parse(representation.observedAt)
      ? underlying.observedAt
      : representation.observedAt;
  const source =
    "Pyth Pro signed Solana payload sha256:" + pythEvidence.signedPayload.sha256;

  const record = (value) => ({
    value,
    status: "VERIFIED",
    evidenceClass: "LIVE_MARKET_OR_ORACLE",
    observedAt,
    source,
  });

  return {
    underlyingPriceUsd: record(underlying.price),
    representationPriceUsd: record(representation.price),
    trackingErrorBps: record(
      trackingErrorBps(representation.price, underlying.price),
    ),
    pythConfidenceBps: record(
      Math.max(underlying.confidenceBps, representation.confidenceBps),
    ),
    pythPublisherCount: record(
      Math.min(underlying.publisherCount, representation.publisherCount),
    ),
    pythPayloadSha256: {
      ...record(pythEvidence.signedPayload.sha256),
      evidenceClass: "SIGNED_OR_AUTHORITATIVE_OFFCHAIN",
    },
  };
}
