import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm, chmod } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(fileURLToPath(new URL("..", import.meta.url)));
const realScript = join(repo, "script/live-arc-testnet.sh");
const chainAddress = `0x${"cc".repeat(20)}`;
const recipientA = `0x${"11".repeat(20)}`;
const recipientB = `0x${"22".repeat(20)}`;
const usdc = "0x3600000000000000000000000000000000000000";
const runtimeHash = `0x${"44".repeat(32)}`;
const mockHead = "a".repeat(40);
let root;

before(async () => {
  root = await mkdtemp(join(tmpdir(), "arc-live-gate-test-"));
  await mkdir(join(root, "chain/script"), { recursive: true });
  await mkdir(join(root, "bin"));
  await copyFile(realScript, join(root, "chain/script/live-arc-testnet.sh"));
  await writeFile(join(root, "bin/cast"), `#!/usr/bin/env bash
set -eu
printf 'cast %s\\n' "$*" >>"$TRACE_LOG"
case "$1" in
  chain-id) [[ "\${MOCK_CAST_FAIL:-}" != rpc ]] || exit 7; echo "\${MOCK_CHAIN_ID:-5042002}" ;;
  wallet) echo "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ;;
  balance) echo "\${MOCK_NATIVE_BALANCE:-1000000000000000000}" ;;
  code) echo "\${MOCK_CODE:-0x6000}" ;;
  keccak) echo "\${MOCK_RUNTIME_HASH:-${runtimeHash}}" ;;
  call)
    case "$2" in
      'usdc()(address)') echo "\${MOCK_TOKEN:-${usdc}}" ;;
      'decimals()(uint8)') echo "\${MOCK_DECIMALS:-6}" ;;
      'balanceOf(address)(uint256)') echo "\${MOCK_TOKEN_BALANCE:-100000000}" ;;
      *) echo 1 ;;
    esac ;;
  *) exit 9 ;;
esac
`);
  await writeFile(join(root, "bin/forge"), `#!/usr/bin/env bash
printf 'forge %s\\n' "$*" >>"$TRACE_LOG"
if [[ " $* " == *" --broadcast "* ]]; then echo 'BLOCKED BY TEST STUB: real Forge never ran' >&2; exit 97; fi
exit 98
`);
  await writeFile(join(root, "bin/git"), `#!/usr/bin/env bash
[[ "$1 $2" == "rev-parse HEAD" ]] || exit 8
echo "$MOCK_HEAD"
`);
  for (const file of ["cast", "forge", "git"]) await chmod(join(root, `bin/${file}`), 0o755);
});

after(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

async function fixture({ profile = "kishore-v1", sourceCommit = mockHead, withEnv = true, withMetadata = true } = {}) {
  const chain = join(root, "chain");
  await rm(join(chain, ".env"), { force: true });
  await rm(join(chain, "deployment-profile.json"), { force: true });
  await rm(join(chain, "deployments"), { recursive: true, force: true });
  const trace = join(root, `trace-${Math.random()}.log`);
  await writeFile(join(chain, "deployment-profile.json"), JSON.stringify({ approved: true, profile, sourceCommit }));
  if (withEnv) {
    await writeFile(join(chain, ".env"), [
      "PRIVATE_KEY=TEST-ONLY-NOT-A-KEY", "ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.io",
      `ARCSPLIT_ADDRESS=${chainAddress}`, `RECIPIENT_A=${recipientA}`, `RECIPIENT_B=${recipientB}`,
      "DEMO_AMOUNT=1000000", `ARCSPLIT_RUNTIME_CODE_HASH=${runtimeHash}`,
    ].join("\n") + "\n");
  }
  if (withMetadata) {
    await mkdir(join(chain, "deployments"), { recursive: true });
    await writeFile(join(chain, "deployments/arc-testnet.json"), JSON.stringify({
      chainId: 5042002, contractAddress: chainAddress, usdcAddress: usdc, usdcDecimals: 6,
    }));
  }
  return { trace, env: {
    ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}`, TRACE_LOG: trace,
    MOCK_HEAD: mockHead, MOCK_RUNTIME_HASH: runtimeHash,
  } };
}

function invoke(action, env) {
  return spawnSync("bash", [join(root, "chain/script/live-arc-testnet.sh"), ...(action ? [action] : [])], {
    cwd: join(root, "chain"), env, encoding: "utf8", timeout: 5000,
  });
}
async function traceText(path) {
  try { return await readFile(path, "utf8"); } catch { return ""; }
}
async function assertBlockedBeforeForge(action, options = {}, vars = {}) {
  const f = await fixture(options);
  const result = invoke(action, { ...f.env, ...vars });
  const trace = await traceText(f.trace);
  assert.notEqual(result.status, 0, `${action} unexpectedly passed its safety gates`);
  assert.doesNotMatch(trace, /^forge /m, `unexpected Forge invocation:\n${trace}`);
  assert.doesNotMatch(trace, /--broadcast/, "no broadcast flag reached any tool stub");
  return { result, trace };
}

test("missing and invalid actions fail before touching tools", async () => {
  for (const action of [undefined, "unknown"]) {
    const { trace } = await assertBlockedBeforeForge(action);
    assert.equal(trace, "");
  }
});

test("each action requires its invoking-shell confirmation", async () => {
  await assertBlockedBeforeForge("deploy");
  await assertBlockedBeforeForge("payment");
  const f = await fixture();
  const r = invoke("deploy", { ...f.env, ARCSPLIT_CONFIRM_DEPLOY: "yes" });
  assert.equal(r.status, 64);
  assert.equal(await traceText(f.trace), "");
});

test("missing, wrong-profile, and wrong-source approval records block before .env or RPC", async () => {
  const missing = await fixture({ withEnv: false });
  const missingProfile = await readFile(join(missing.trace, "not-a-file")).catch(() => null);
  assert.equal(missingProfile, null);
  // Remove only the test fixture selection record to model the missing owner gate.
  await rm(join(root, "chain/deployment-profile.json"));
  const noApproval = invoke("deploy", { ...missing.env, ARCSPLIT_CONFIRM_DEPLOY: "YES" });
  assert.notEqual(noApproval.status, 0);
  assert.equal(await traceText(missing.trace), "");
  await assertBlockedBeforeForge("deploy", { profile: "studio-v1" }, { ARCSPLIT_CONFIRM_DEPLOY: "YES" });
  await assertBlockedBeforeForge("deploy", { sourceCommit: "b".repeat(40) }, { ARCSPLIT_CONFIRM_DEPLOY: "YES" });
});

test("missing .env blocks before wallet tools", async () => {
  const f = await fixture({ withEnv: false });
  const result = invoke("deploy", { ...f.env, ARCSPLIT_CONFIRM_DEPLOY: "YES" });
  assert.notEqual(result.status, 0);
  assert.equal(await traceText(f.trace), "");
});

test("wrong chain and RPC failure never reach a broadcast tool", async () => {
  await assertBlockedBeforeForge("deploy", {}, { ARCSPLIT_CONFIRM_DEPLOY: "YES", MOCK_CHAIN_ID: "1" });
  await assertBlockedBeforeForge("deploy", {}, { ARCSPLIT_CONFIRM_DEPLOY: "YES", MOCK_CAST_FAIL: "rpc" });
});

test("native gas insufficiency blocks deployment before Forge", async () => {
  await assertBlockedBeforeForge("deploy", {}, { ARCSPLIT_CONFIRM_DEPLOY: "YES", MOCK_NATIVE_BALANCE: "0" });
});

test("deploy action reaches only the Forge stub, which refuses --broadcast", async () => {
  const f = await fixture();
  const result = invoke("deploy", { ...f.env, ARCSPLIT_CONFIRM_DEPLOY: "YES" });
  assert.equal(result.status, 97);
  assert.match(await traceText(f.trace), /forge .*--broadcast/);
  assert.match(result.stderr, /BLOCKED BY TEST STUB/);
});

test("payment requires receipt-backed metadata and reviewed runtime hash", async () => {
  await assertBlockedBeforeForge("payment", { withMetadata: false }, { ARCSPLIT_CONFIRM_PAYMENT: "YES" });
  const f = await fixture();
  const result = invoke("payment", { ...f.env, ARCSPLIT_CONFIRM_PAYMENT: "YES", MOCK_RUNTIME_HASH: `0x${"55".repeat(32)}` });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(await traceText(f.trace), /^forge /m);
});

test("wrong metadata token or decimals block before Forge", async () => {
  for (const metadata of [
    { chainId: 1 }, { contractAddress: `0x${"33".repeat(20)}` }, { usdcAddress: recipientA }, { usdcDecimals: 18 },
  ]) {
    const f = await fixture();
    const dpath = join(root, "chain/deployments/arc-testnet.json");
    const d = JSON.parse(await readFile(dpath, "utf8"));
    await writeFile(dpath, JSON.stringify({ ...d, ...metadata }));
    const result = invoke("payment", { ...f.env, ARCSPLIT_CONFIRM_PAYMENT: "YES" });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(await traceText(f.trace), /^forge /m);
  }
});

test("wrong onchain token, decimals, runtime code, or empty code block payment", async () => {
  for (const vars of [
    { MOCK_TOKEN: recipientA }, { MOCK_DECIMALS: "18" }, { MOCK_RUNTIME_HASH: `0x${"55".repeat(32)}` }, { MOCK_CODE: "0x" },
  ]) await assertBlockedBeforeForge("payment", {}, { ARCSPLIT_CONFIRM_PAYMENT: "YES", ...vars });
});

test("invalid or duplicate recipients and contract recipient block payment", async () => {
  for (const vars of [
    { RECIPIENT_A: "" }, { RECIPIENT_A: recipientA, RECIPIENT_B: recipientA },
    { RECIPIENT_A: chainAddress, RECIPIENT_B: recipientB }, { RECIPIENT_A: `0x${"00".repeat(20)}` },
  ]) await assertBlockedBeforeForge("payment", {}, { ARCSPLIT_CONFIRM_PAYMENT: "YES", ...vars });
});

test("zero, malformed, and underfunded payment amounts block", async () => {
  for (const vars of [
    { DEMO_AMOUNT: "0" }, { DEMO_AMOUNT: "1.5" }, { DEMO_AMOUNT: "100000001", MOCK_TOKEN_BALANCE: "100000000" },
  ]) await assertBlockedBeforeForge("payment", {}, { ARCSPLIT_CONFIRM_PAYMENT: "YES", ...vars });
});

async function deploymentEvidence(scenario = "valid") {
  const scratch = await mkdtemp(join(root, "evidence-"));
  await mkdir(join(scratch, "script"));
  await mkdir(join(scratch, "broadcast/Deploy.s.sol/5042002"), { recursive: true });
  await mkdir(join(scratch, "out/ArcSplit.sol"), { recursive: true });
  await copyFile(join(repo, "script/write-deployment.mjs"), join(scratch, "script/write-deployment.mjs"));
  const hash = `0x${"ab".repeat(32)}`;
  const receipt = { transactionHash: hash, status: "0x1", contractAddress: chainAddress, blockNumber: "0x10", blockHash: `0x${"ef".repeat(32)}` };
  await writeFile(join(scratch, "broadcast/Deploy.s.sol/5042002/run-latest.json"), JSON.stringify({
    transactions: scenario === "missing-create" ? [] : [{ transactionType: "CREATE", contractName: "ArcSplit", hash, contractAddress: chainAddress }],
    receipts: [receipt],
  }));
  await writeFile(join(scratch, "out/ArcSplit.sol/ArcSplit.json"), JSON.stringify({ metadata: { compiler: { version: "0.8.28" } } }));
  await writeFile(join(scratch, "mock-fetch.mjs"), `
    const receipt = ${JSON.stringify(receipt)};
    globalThis.fetch = async (_url, options) => {
      const { method } = JSON.parse(options.body);
      const scenario = process.env.MOCK_EVIDENCE_SCENARIO;
      let result = method === "eth_chainId" ? "0x4cef52" : method === "eth_getCode" ? "0x6000" : receipt;
      if (method === "eth_getCode") {
        if (scenario === "rpc-error") return { ok: true, json: async () => ({ error: { code: -32000, message: "unavailable" } }) };
        if (scenario === "http-error") return { ok: false, status: 503, json: async () => ({ result }) };
        if (scenario === "missing-code") return { ok: true, json: async () => ({}) };
        if (scenario === "malformed-code") result = "not-bytecode";
        if (scenario === "odd-code") result = "0x123";
        if (scenario === "null-code") result = null;
        if (scenario === "empty-code") result = "0x";
      }
      if (method === "eth_chainId" && scenario === "wrong-chain") result = "0x1";
      if (method === "eth_getTransactionReceipt" && scenario === "wrong-hash") result = { ...receipt, transactionHash: "0x" + "11".repeat(32) };
      if (method === "eth_getTransactionReceipt" && scenario === "wrong-block") result = { ...receipt, blockNumber: "0x11" };
      if (method === "eth_getTransactionReceipt" && scenario === "wrong-block-hash") result = { ...receipt, blockHash: "0x" + "22".repeat(32) };
      if (method === "eth_getTransactionReceipt" && scenario === "failed-receipt") result = { ...receipt, status: "0x0" };
      if (method === "eth_getTransactionReceipt" && scenario === "null-receipt") result = null;
      return { ok: true, json: async () => ({ result }) };
    };
  `);
  const result = spawnSync(process.execPath, ["--import", join(scratch, "mock-fetch.mjs"), join(scratch, "script/write-deployment.mjs")], {
    cwd: scratch, encoding: "utf8", env: { ...process.env, SOURCE_COMMIT: mockHead, MOCK_EVIDENCE_SCENARIO: scenario },
  });
  const metadata = await readFile(join(scratch, "deployments/arc-testnet.json"), "utf8").catch(() => null);
  return { result, metadata };
}

test("deployment writer accepts matching successful public receipt and bytecode", async () => {
  const { result, metadata } = await deploymentEvidence();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(metadata).deploymentBlock, 16);
});

test("deployment writer never publishes metadata after failed or malformed RPC code responses", async () => {
  for (const scenario of ["rpc-error", "http-error", "missing-code", "malformed-code", "odd-code", "null-code", "empty-code"]) {
    const { result, metadata } = await deploymentEvidence(scenario);
    assert.notEqual(result.status, 0, scenario);
    assert.equal(metadata, null, `${scenario} must not publish deployment evidence`);
  }
});

test("deployment writer rejects a wrong chain or mismatched receipt identity", async () => {
  for (const scenario of ["missing-create", "wrong-chain", "wrong-hash", "wrong-block", "wrong-block-hash", "failed-receipt", "null-receipt"]) {
    const { result, metadata } = await deploymentEvidence(scenario);
    assert.notEqual(result.status, 0, scenario);
    assert.equal(metadata, null, `${scenario} must not publish deployment evidence`);
  }
});
