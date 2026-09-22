const API = process.env.PYTH_PRO_API_BASE || "https://pyth-lazer.dourolabs.app";
const KEY = process.env.PYTH_API_KEY;
if (!KEY) throw new Error("PYTH_API_KEY is required");

const feeds = [
  ["Equity.US.AAPL/USD", 922],
  ["Crypto.AAPLX/USD", 1792],
  ["Crypto.AAPLON/USD", 3132],
  ["Crypto.AAPLON/USD (symbol-discovery alternate)", 2239],
];

for (const [symbol, id] of feeds) {
  const response = await fetch(API + "/v1/latest_price", {
    method: "POST",
    headers: {
      authorization: "Bearer " + KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      priceFeedIds: [id],
      properties: ["price", "confidence", "exponent", "publisherCount", "marketSession", "feedUpdateTimestamp"],
      formats: ["solana"],
      channel: "fixed_rate@200ms",
      ignoreInvalidFeeds: false,
      jsonBinaryEncoding: "base64",
    }),
  });
  const raw = await response.text();
  const reason = response.ok ? "ENTITLED" : raw.replace(/\s+/g, " ").slice(0, 220);
  console.log(JSON.stringify({ symbol, id, httpStatus: response.status, result: reason }));
}
