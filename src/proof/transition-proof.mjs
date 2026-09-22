import { createHash } from "node:crypto";

function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(",")}}`;
}

export function sha256Canonical(value) {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

export function buildEvidenceRoot(records) {
  const leaves = records
    .map((record) => ({
      source: record.source,
      evidenceClass: record.evidenceClass,
      observedAt: record.observedAt,
      expiresAt: record.expiresAt ?? null,
      payloadHash: record.payloadHash,
      status: record.status,
    }))
    .sort((a, b) => canonicalize(a).localeCompare(canonicalize(b)));

  return sha256Canonical(leaves);
}

export function buildTransitionProof({
  evaluation,
  covenant,
  passport,
  evidenceRecords,
  preState,
  proposedPostState,
  authorityRef,
  executionCommitment,
  nonce,
  expiresAt,
}) {
  if (evaluation?.decision !== "ALLOW") {
    throw new Error("Only an ALLOW evaluation can become an executable transition proof");
  }
  if (!Number.isSafeInteger(nonce) || nonce < 0) throw new Error("nonce must be a non-negative safe integer");
  if (!expiresAt) throw new Error("expiresAt is required");

  const packet = {
    schemaVersion: "covenant.transition-proof-packet.v1",
    positionId: evaluation.positionId,
    positionVersion: preState.positionVersion,
    covenantHash: sha256Canonical(covenant),
    covenantVersion: covenant.version,
    claimPassportHash: sha256Canonical(passport),
    claimPassportVersion: passport.version,
    evidenceRoot: buildEvidenceRoot(evidenceRecords),
    operator: evaluation.operator,
    preStateHash: sha256Canonical(preState),
    proposedPostStateHash: sha256Canonical(proposedPostState),
    authorityRef,
    executionCommitment,
    executionCommitmentHash:
      executionCommitment?.onchainExecutionCommitmentHash ??
      sha256Canonical(executionCommitment),
    targetClaimMint: passport.mint ?? null,
    nonce,
    expiresAt,
    ruleResultsHash: sha256Canonical(evaluation.ruleResults),
  };

  return {
    ...packet,
    proofHash: sha256Canonical(packet),
  };
}

export function buildReceipt({
  proof,
  transactionReference,
  settledState,
  outcome,
  observedAt,
  errors = [],
}) {
  const receipt = {
    schemaVersion: "covenant.transition-receipt.v1",
    proofHash: proof.proofHash,
    positionId: proof.positionId,
    covenantHash: proof.covenantHash,
    claimPassportHash: proof.claimPassportHash,
    evidenceRoot: proof.evidenceRoot,
    operator: proof.operator,
    preStateHash: proof.preStateHash,
    proposedPostStateHash: proof.proposedPostStateHash,
    settledStateHash: sha256Canonical(settledState),
    authorityRef: proof.authorityRef,
    executionCommitment: proof.executionCommitment,
    executionCommitmentHash: proof.executionCommitmentHash,
    targetClaimMint: proof.targetClaimMint,
    transactionReference,
    outcome,
    observedAt,
    errors,
  };

  return { ...receipt, receiptHash: sha256Canonical(receipt) };
}
