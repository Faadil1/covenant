import test from "node:test";
import assert from "node:assert/strict";
import {
  confidenceBps,
  decimalPrice,
  parsePythLatestResponse,
  trackingErrorBps,
  buildApplePythMarketEvidence,
  PYTH_STOCKLANA_SYMBOLS,
} from "../src/evidence/pyth-pro.mjs";

const requestedFeeds = [
  { id: 922, symbol: PYTH_STOCKLANA_SYMBOLS.AAPL },
  { id: 1792, symbol: PYTH_STOCKLANA_SYMBOLS.AAPLX },
];

test("Pyth decimal and confidence conversion is deterministic", () => {
  const feed = { price: "34000000", exponent: -5, confidence: "3400" };
  assert.equal(decimalPrice(feed), 340);
  assert.equal(confidenceBps(feed), 1);
});

test("tracking error is expressed in basis points", () => {
  assert.equal(trackingErrorBps(339.83, 340), 5);
  assert.equal(trackingErrorBps(343.4, 340), 100);
});

test("signed Pyth response becomes evidence-bearing market records", () => {
  const payload = {
    parsed: {
      timestampUs: "1790091000000000",
      priceFeeds: [
        {
          priceFeedId: 922,
          price: "34000000",
          confidence: "3400",
          exponent: -5,
          publisherCount: 4,
          marketSession: "regular",
          feedUpdateTimestamp: "1790091000000000"
        },
        {
          priceFeedId: 1792,
          price: "33983000000",
          confidence: "6796600",
          exponent: -8,
          publisherCount: 3,
          marketSession: "regular",
          feedUpdateTimestamp: "1790091000000000"
        }
      ]
    },
    solana: {
      encoding: "base64",
      data: Buffer.from("signed-pyth-payload-fixture").toString("base64")
    }
  };

  const parsed = parsePythLatestResponse(payload, requestedFeeds);
  assert.equal(parsed.feeds[0].price, 340);
  assert.equal(parsed.feeds[1].price, 339.83);
  assert.match(parsed.signedPayload.sha256, /^[0-9a-f]{64}$/);

  const market = buildApplePythMarketEvidence(
    parsed,
    PYTH_STOCKLANA_SYMBOLS.AAPLX,
  );
  assert.equal(market.trackingErrorBps.value, 5);
  assert.equal(market.pythPublisherCount.value, 3);
  assert.equal(market.pythPayloadSha256.value, parsed.signedPayload.sha256);
});
