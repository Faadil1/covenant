import { sha256Canonical } from "../proof/transition-proof.mjs";

const SUCCESSFUL_TERMINAL_OUTCOMES = new Set(["EXECUTED", "MIGRATED"]);

function fail(reasonCode, detail = {}) {
  return {
    valid: false,
    reasonCode,
    ...detail,
  };
}

/**
 * Verify a Transition Receipt against the exact proof and observed settled state.
 *
 * This is intentionally deterministic and offline. It does not assert that a
 * transaction exists on a chain; callers must independently verify the
 * transaction reference against the target network when that evidence class is
 * required.
 */
export function verifyTransitionReceipt({
  proof,
  receipt,
  settledState,
  expectedTransactionReference = null,
}) {
  if (!proof || !receipt || !settledState) {
    return fail("RECEIPT_INPUT_MISSING");
  }

  if (receipt.proofHash !== proof.proofHash) {
    return fail("PROOF_HASH_MISMATCH");
  }

  if (receipt.positionId !== proof.positionId) {
    return fail("POSITION_ID_MISMATCH");
  }

  if (receipt.covenantHash !== proof.covenantHash) {
    return fail("COVENANT_HASH_MISMATCH");
  }

  if (receipt.claimPassportHash !== proof.claimPassportHash) {
    return fail("CLAIM_PASSPORT_HASH_MISMATCH");
  }

  if (receipt.evidenceRoot !== proof.evidenceRoot) {
    return fail("EVIDENCE_ROOT_MISMATCH");
  }

  if (receipt.executionCommitmentHash !== proof.executionCommitmentHash) {
    return fail("EXECUTION_COMMITMENT_MISMATCH");
  }

  const settledStateHash = sha256Canonical(settledState);
  if (receipt.settledStateHash !== settledStateHash) {
    return fail("SETTLED_STATE_HASH_MISMATCH", {
      expected: settledStateHash,
      actual: receipt.settledStateHash,
    });
  }

  if (expectedTransactionReference) {
    const actual = receipt.transactionReference ?? {};
    for (const [key, value] of Object.entries(expectedTransactionReference)) {
      if (actual[key] !== value) {
        return fail("TRANSACTION_REFERENCE_MISMATCH", {
          field: key,
          expected: value,
          actual: actual[key],
        });
      }
    }
  }

  if (!SUCCESSFUL_TERMINAL_OUTCOMES.has(receipt.outcome)) {
    return fail("RECEIPT_OUTCOME_NOT_SUCCESSFUL", { outcome: receipt.outcome });
  }

  const material = { ...receipt };
  delete material.receiptHash;
  const recomputedReceiptHash = sha256Canonical(material);
  if (receipt.receiptHash !== recomputedReceiptHash) {
    return fail("RECEIPT_HASH_MISMATCH", {
      expected: recomputedReceiptHash,
      actual: receipt.receiptHash,
    });
  }

  return {
    valid: true,
    reasonCode: "RECEIPT_VALID",
    receiptHash: receipt.receiptHash,
    settledStateHash,
    proofHash: proof.proofHash,
  };
}
