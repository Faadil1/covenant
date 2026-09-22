import test from "node:test";
import assert from "node:assert/strict";
import { buildReceipt, buildTransitionProof, sha256Canonical } from "../src/proof/transition-proof.mjs";

const covenant = { id: "covenant:apple:42", version: 1, rules: [{ id: "r1", expected: true }] };
const passport = { id: "apple:ondo:aaplon", version: 1, mint: "123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo" };
const evaluation = {
  decision: "ALLOW",
  positionId: "position:apple:42",
  operator: "ACQUIRE",
  ruleResults: [{ ruleId: "r1", outcome: "ALLOW", reasonCode: "RULE_PASS" }],
};
const evidenceRecords = [
  {
    source: "solana-rpc",
    evidenceClass: "ONCHAIN_DETERMINISTIC",
    observedAt: "2026-09-22T05:40:00.000Z",
    expiresAt: null,
    payloadHash: "a".repeat(64),
    status: "VERIFIED",
  },
  {
    source: "pyth",
    evidenceClass: "LIVE_MARKET_OR_ORACLE",
    observedAt: "2026-09-22T05:40:01.000Z",
    expiresAt: "2026-09-22T05:40:31.000Z",
    payloadHash: "b".repeat(64),
    status: "VERIFIED",
  },
];

function proofInput() {
  return {
    evaluation,
    covenant,
    passport,
    evidenceRecords,
    preState: { positionVersion: 7, usdc: 500_000_000, claim: null },
    proposedPostState: { positionVersion: 8, usdc: 400_000_000, claim: passport.mint },
    authorityRef: { evaluator: "evaluator-pubkey", maxAutonomousUsd: 100 },
    executionCommitment: {
      inputMint: "USDC",
      outputMint: passport.mint,
      amountIn: "100000000",
      minOut: "278549712",
      routeHash: "c".repeat(64),
    },
    nonce: 12,
    expiresAt: "2026-09-22T05:40:31.000Z",
  };
}

test("canonical hash is independent of object key insertion order", () => {
  assert.equal(sha256Canonical({ a: 1, b: 2 }), sha256Canonical({ b: 2, a: 1 }));
});

test("ALLOW evaluation becomes an exact proof packet", () => {
  const proof = buildTransitionProof(proofInput());
  assert.equal(proof.covenantVersion, 1);
  assert.equal(proof.claimPassportVersion, 1);
  assert.equal(proof.positionVersion, 7);
  assert.equal(proof.nonce, 12);
  assert.match(proof.proofHash, /^[0-9a-f]{64}$/);
});

test("REFUSE can never become executable proof", () => {
  const input = proofInput();
  input.evaluation = { ...evaluation, decision: "REFUSE" };
  assert.throws(() => buildTransitionProof(input), /Only an ALLOW/);
});

test("changing route, nonce, evidence or post-state changes proof hash", () => {
  const base = buildTransitionProof(proofInput());

  for (const mutate of [
    (x) => (x.executionCommitment.routeHash = "d".repeat(64)),
    (x) => (x.nonce = 13),
    (x) => (x.evidenceRecords[0].payloadHash = "e".repeat(64)),
    (x) => (x.proposedPostState.usdc = 399_999_999),
  ]) {
    const input = proofInput();
    mutate(input);
    assert.notEqual(buildTransitionProof(input).proofHash, base.proofHash);
  }
});

test("receipt binds proof to settled state and transaction reference", () => {
  const proof = buildTransitionProof(proofInput());
  const receipt = buildReceipt({
    proof,
    transactionReference: "solana:signature:demo",
    settledState: { positionVersion: 8, usdc: 400_000_000, claim: passport.mint },
    outcome: "SETTLED",
    observedAt: "2026-09-22T05:40:15.000Z",
  });

  assert.equal(receipt.proofHash, proof.proofHash);
  assert.equal(receipt.outcome, "SETTLED");
  assert.match(receipt.receiptHash, /^[0-9a-f]{64}$/);
});
