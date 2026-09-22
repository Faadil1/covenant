const KEY = process.env.PYTH_API_KEY;
if (!KEY) throw new Error("PYTH_API_KEY is required");

const HERMES = process.env.PYTH_HERMES_URL || "https://pyth.dourolabs.app/hermes";

async function getJson(url) {
  const response = await fetch(url, {
    headers: { authorization: "Bearer " + KEY },
  });
  const raw = await response.text();
  let body = null;
  try { body = JSON.parse(raw); } catch {}
  return { status: response.status, ok: response.ok, body, raw: raw.slice(0, 500) };
}

const discovery = await getJson(HERMES + "/v2/price_feeds?query=AAPL&asset_type=equity");
console.log(JSON.stringify({
  check: "hermes-discovery-equity-aapl",
  httpStatus: discovery.status,
  resultCount: Array.isArray(discovery.body) ? discovery.body.length : null,
  results: Array.isArray(discovery.body)
    ? discovery.body.slice(0, 20).map((x) => ({
        id: x.id,
        symbol: x.attributes?.symbol ?? x.symbol ?? null,
        displaySymbol: x.attributes?.display_symbol ?? null,
        assetType: x.attributes?.asset_type ?? null,
      }))
    : discovery.raw,
}, null, 2));

const discoveryAll = await getJson(HERMES + "/v2/price_feeds?query=AAPL");
console.log(JSON.stringify({
  check: "hermes-discovery-all-aapl",
  httpStatus: discoveryAll.status,
  resultCount: Array.isArray(discoveryAll.body) ? discoveryAll.body.length : null,
  results: Array.isArray(discoveryAll.body)
    ? discoveryAll.body.slice(0, 30).map((x) => ({
        id: x.id,
        symbol: x.attributes?.symbol ?? x.symbol ?? null,
        displaySymbol: x.attributes?.display_symbol ?? null,
        assetType: x.attributes?.asset_type ?? null,
      }))
    : discoveryAll.raw,
}, null, 2));

const candidates = Array.isArray(discoveryAll.body)
  ? discoveryAll.body.filter((x) => {
      const s = String(x.attributes?.symbol ?? x.symbol ?? "").toUpperCase();
      return s.includes("AAPL");
    })
  : [];

for (const candidate of candidates.slice(0, 10)) {
  const id = candidate.id;
  const latest = await getJson(HERMES + "/v2/updates/price/latest?ids[]=" + encodeURIComponent(id));
  console.log(JSON.stringify({
    check: "hermes-latest",
    id,
    symbol: candidate.attributes?.symbol ?? candidate.symbol ?? null,
    httpStatus: latest.status,
    hasBinary: Boolean(latest.body?.binary?.data?.length),
    parsedCount: Array.isArray(latest.body?.parsed) ? latest.body.parsed.length : null,
    error: latest.ok ? null : latest.raw,
  }));
}

for (const symbol of ["Equity.US.AAPL/USD", "Crypto.AAPLX/USD", "Crypto.AAPLON/USD"]) {
  const url = "https://benchmarks.pyth.network/v1/shims/tradingview/symbols?symbol=" + encodeURIComponent(symbol);
  const result = await fetch(url);
  const text = await result.text();
  console.log(JSON.stringify({
    check: "benchmarks-symbol",
    symbol,
    httpStatus: result.status,
    bodyPreview: text.replace(/\s+/g, " ").slice(0, 240),
  }));
}
