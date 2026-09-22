import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const RPC_URL = process.env.SURFPOOL_RPC_URL || "http://127.0.0.1:8899";

const COVENANT_PROGRAM =
  process.env.COVENANT_PROGRAM_ID ||
  "CEKUNCY7VYeHdwyyWCJTKQkGgMzPeTsx2uwBoQ98wm3z";
const JUPITER_V6_PROGRAM =
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const SPL_TOKEN_PROGRAM =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM =
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const USDC =
  process.env.COVENANT_INPUT_MINT ||
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const AAPLON =
  process.env.COVENANT_OUTPUT_MINT ||
  "123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo";
const POSITION = process.env.COVENANT_TAKER || "";
const EXPECTED_OUTPUT_ACCOUNT =
  process.env.COVENANT_DESTINATION_TOKEN_ACCOUNT || "";
const INPUT_AMOUNT = BigInt(process.env.COVENANT_INPUT_AMOUNT || "100000000");

if (!POSITION) {
  throw new Error(
    "COVENANT_TAKER is required and must be the Invariant Position PDA.",
  );
}

async function rpc(method, params = []) {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(
      "Surfpool RPC " + method + " failed: " + JSON.stringify(body.error ?? body),
    );
  }
  return body.result;
}

function sha256(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}

async function account(address, encoding = "base64") {
  const result = await rpc("getAccountInfo", [
    address,
    { encoding, commitment: "processed" },
  ]);
  return result?.value ?? null;
}

function check(name, ok, detail) {
  return { name, status: ok ? "PASS" : "FAIL", detail };
}

function parsedTokenInfo(record) {
  return record?.account?.data?.parsed?.info ?? null;
}

async function tokenAccountsByMint(owner, mint) {
  const result = await rpc("getTokenAccountsByOwner", [
    owner,
    { mint },
    { encoding: "jsonParsed", commitment: "processed" },
  ]);
  return result?.value ?? [];
}

async function main() {
  const observedAt = new Date().toISOString();
  const checks = [];

  const health = await rpc("getHealth");
  checks.push(check("surfpool.health", health === "ok", { health, rpc: RPC_URL }));

  const [
    covenantProgram,
    jupiterProgram,
    usdcMint,
    aaplonMint,
    positionAccount,
  ] = await Promise.all([
    account(COVENANT_PROGRAM),
    account(JUPITER_V6_PROGRAM),
    account(USDC),
    account(AAPLON),
    account(POSITION),
  ]);

  checks.push(
    check(
      "program.covenant_executable",
      Boolean(covenantProgram?.executable),
      covenantProgram
        ? { owner: covenantProgram.owner, executable: covenantProgram.executable }
        : { missing: true },
    ),
  );
  checks.push(
    check(
      "program.jupiter_v6_executable",
      Boolean(jupiterProgram?.executable),
      jupiterProgram
        ? { owner: jupiterProgram.owner, executable: jupiterProgram.executable }
        : { missing: true },
    ),
  );
  checks.push(
    check(
      "mint.usdc_classic_token",
      usdcMint?.owner === SPL_TOKEN_PROGRAM,
      { expectedOwner: SPL_TOKEN_PROGRAM, actualOwner: usdcMint?.owner ?? null },
    ),
  );
  checks.push(
    check(
      "mint.aaplon_token_2022",
      aaplonMint?.owner === TOKEN_2022_PROGRAM,
      { expectedOwner: TOKEN_2022_PROGRAM, actualOwner: aaplonMint?.owner ?? null },
    ),
  );
  checks.push(
    check(
      "position.canonical_program_owner",
      positionAccount?.owner === COVENANT_PROGRAM && !positionAccount?.executable,
      {
        position: POSITION,
        expectedOwner: COVENANT_PROGRAM,
        actualOwner: positionAccount?.owner ?? null,
        executable: positionAccount?.executable ?? null,
      },
    ),
  );

  const [inputs, outputs] = await Promise.all([
    tokenAccountsByMint(POSITION, USDC),
    tokenAccountsByMint(POSITION, AAPLON),
  ]);

  const input = inputs[0] ?? null;
  const output = EXPECTED_OUTPUT_ACCOUNT
    ? outputs.find((candidate) => candidate.pubkey === EXPECTED_OUTPUT_ACCOUNT) ?? null
    : outputs[0] ?? null;

  const inputInfo = parsedTokenInfo(input);
  const outputInfo = parsedTokenInfo(output);
  const inputRaw = BigInt(inputInfo?.tokenAmount?.amount ?? "0");

  checks.push(
    check(
      "position.usdc_account",
      Boolean(
        input &&
          input.account?.owner === SPL_TOKEN_PROGRAM &&
          inputInfo?.owner === POSITION &&
          inputInfo?.mint === USDC,
      ),
      {
        address: input?.pubkey ?? null,
        tokenProgram: input?.account?.owner ?? null,
        authority: inputInfo?.owner ?? null,
        mint: inputInfo?.mint ?? null,
        amountRaw: inputInfo?.tokenAmount?.amount ?? null,
      },
    ),
  );

  checks.push(
    check(
      "position.usdc_funded",
      inputRaw >= INPUT_AMOUNT,
      {
        availableRaw: inputRaw.toString(),
        requiredRaw: INPUT_AMOUNT.toString(),
      },
    ),
  );

  checks.push(
    check(
      "position.aaplon_account",
      Boolean(
        output &&
          output.account?.owner === TOKEN_2022_PROGRAM &&
          outputInfo?.owner === POSITION &&
          outputInfo?.mint === AAPLON,
      ),
      {
        address: output?.pubkey ?? null,
        expectedAddress: EXPECTED_OUTPUT_ACCOUNT || null,
        tokenProgram: output?.account?.owner ?? null,
        authority: outputInfo?.owner ?? null,
        mint: outputInfo?.mint ?? null,
        amountRaw: outputInfo?.tokenAmount?.amount ?? null,
      },
    ),
  );

  const status = checks.every((item) => item.status === "PASS")
    ? "PASS"
    : "FAIL_CLOSED";

  const report = {
    schemaVersion: "covenant.t3b-surfpool-preflight.v1",
    observedAt,
    status,
    environment: {
      rpcUrl: RPC_URL,
      covenantProgram: COVENANT_PROGRAM,
      jupiterProgram: JUPITER_V6_PROGRAM,
      position: POSITION,
      inputMint: USDC,
      outputMint: AAPLON,
      expectedInputAmountRaw: INPUT_AMOUNT.toString(),
      expectedOutputTokenAccount: EXPECTED_OUTPUT_ACCOUNT || null,
    },
    checks,
    truthBoundary: {
      stateMutation: "NONE",
      authorization: "NONE",
      note:
        "This preflight proves that the mainnet-shaped fork exposes the exact programs, mints and Position-owned token accounts required by T3b. It does not authorize or execute a trade.",
    },
  };

  const envelope = { ...report, reportHash: sha256(report) };
  await mkdir("evidence/t3b", { recursive: true });
  const path =
    "evidence/t3b/surfpool-preflight-" +
    observedAt.replace(/[:.]/g, "-") +
    ".json";
  await writeFile(path, JSON.stringify(envelope, null, 2) + "\n");

  console.log(JSON.stringify(envelope, null, 2));
  console.error("\nCOVENANT T3b Surfpool preflight: " + status);
  console.error("Evidence: " + path);

  if (status !== "PASS") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
