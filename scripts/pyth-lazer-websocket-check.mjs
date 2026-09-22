import { createHash } from "node:crypto";
import { PythLazerClient } from "@pythnetwork/pyth-lazer-sdk";
import { parsePythLatestResponse } from "../src/evidence/pyth-pro.mjs";

const token = process.env.LAZER_TOKEN || process.env.PYTH_API_KEY;
if (!token) throw new Error("Set LAZER_TOKEN or PYTH_API_KEY in your environment");

const requestedFeeds = [
  { symbol: "Equity.US.AAPL/USD", id: 922 },
  { symbol: "Crypto.AAPLX/USD", id: 1792 },
  { symbol: "Crypto.AAPLON/USD", id: 3132 },
];

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

let client;
let settled = false;
let timeout;

function stop(code = 0) {
  if (settled) return;
  settled = true;
  clearTimeout(timeout);
  try { client?.shutdown(); } catch {}
  setTimeout(() => process.exit(code), 50);
}

try {
  client = await PythLazerClient.create({
    token,
    logger: {
      debug: () => {},
      info: () => {},
      warn: (...args) => console.error("[pyth-lazer warn]", ...args),
      error: (...args) => console.error("[pyth-lazer error]", ...args),
    },
    webSocketPoolConfig: {
      urls: [
        "wss://pyth-lazer-0.dourolabs.app/v1/stream",
        "wss://pyth-lazer-1.dourolabs.app/v1/stream",
        "wss://pyth-lazer-2.dourolabs.app/v1/stream",
      ],
    },
    onWebSocketPoolError: (error) => {
      console.error("PYTH_LAZER_POOL_ERROR", String(error));
    },
  });

  client.addAllConnectionsDownListener(() => {
    console.error("PYTH_LAZER_ALL_CONNECTIONS_DOWN");
  });

  client.addMessageListener((message) => {
    if (settled || message.type !== "json") return;

    const value = message.value;
    if (value?.type !== "streamUpdated") {
      console.log(JSON.stringify({
        transport: "Pyth Lazer WebSocket SDK",
        messageType: value?.type ?? null,
        subscriptionId: value?.subscriptionId ?? null,
        error: value?.error ?? value?.message ?? value?.reason ?? null,
        rawKeys: value && typeof value === "object" ? Object.keys(value) : [],
      }, null, 2));

      if (String(value?.type || "").toLowerCase().includes("error")) stop(2);
      return;
    }

    try {
      const parsed = parsePythLatestResponse(value, requestedFeeds);
      console.log(JSON.stringify({
        transport: "Pyth Lazer WebSocket SDK",
        status: "LIVE_STREAM_RECEIVED",
        subscriptionId: value.subscriptionId,
        observedAt: parsed.observedAt,
        feeds: parsed.feeds.map((feed) => ({
          symbol: feed.symbol,
          id: feed.id,
          price: feed.price,
          confidenceBps: feed.confidenceBps,
          publisherCount: feed.publisherCount,
          marketSession: feed.marketSession,
          observedAt: feed.observedAt,
        })),
        signedSolanaPayload: {
          byteLength: parsed.signedPayload.byteLength,
          sha256: parsed.signedPayload.sha256,
        },
        rawMessageSha256: sha256(JSON.stringify(value)),
      }, null, 2));
      stop(0);
    } catch (error) {
      console.error("PYTH_LAZER_PARSE_ERROR", String(error));
      stop(3);
    }
  });

  client.subscribe({
    type: "subscribe",
    subscriptionId: 1,
    priceFeedIds: [922, 1792, 3132],
    properties: [
      "price",
      "confidence",
      "exponent",
      "publisherCount",
      "marketSession",
      "feedUpdateTimestamp",
    ],
    formats: ["solana"],
    channel: "fixed_rate@200ms",
    deliveryFormat: "json",
    jsonBinaryEncoding: "hex",
    parsed: true,
    ignoreInvalidFeeds: false,
  });

  timeout = setTimeout(() => {
    console.error("PYTH_LAZER_TIMEOUT_NO_STREAM_UPDATE");
    stop(4);
  }, 12000);
} catch (error) {
  console.error("PYTH_LAZER_CREATE_OR_SUBSCRIBE_ERROR", String(error));
  try { client?.shutdown(); } catch {}
  process.exit(5);
}
