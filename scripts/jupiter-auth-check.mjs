const key = process.env.JUPITER_API_KEY;
if (!key) throw new Error("JUPITER_API_KEY is required");

const params = new URLSearchParams({
  inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  outputMint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
  amount: "5000000",
  slippageBps: "25",
  restrictIntermediateTokens: "true",
  instructionVersion: "V2",
});

const response = await fetch("https://api.jup.ag/swap/v1/quote?" + params, {
  headers: { "x-api-key": key },
});
const raw = await response.text();
if (!response.ok) {
  throw new Error("Jupiter auth/quote check failed: HTTP " + response.status + " " + raw.slice(0, 500));
}
const body = JSON.parse(raw);
console.log(JSON.stringify({
  httpStatus: response.status,
  authenticated: true,
  inputMint: body.inputMint,
  outputMint: body.outputMint,
  inAmount: body.inAmount,
  outAmountPresent: Boolean(body.outAmount),
  priceImpactPct: body.priceImpactPct ?? null,
  routeCount: Array.isArray(body.routePlan) ? body.routePlan.length : 0,
}, null, 2));
