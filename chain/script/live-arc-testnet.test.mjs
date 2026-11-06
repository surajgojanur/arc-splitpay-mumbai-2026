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
  await copyFile(join(repo, "script/amounts.mjs"), join(root, "chain/script/amounts.mjs"));
  await copyFile(join(repo, "script/payment-invoice-id.mjs"), join(root, "chain/script/payment-invoice-id.mjs"));
  await copyFile(join(repo, "script/broadcast-summary.mjs"), join(root, "chain/script/broadcast-summary.mjs"));
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
    case "$3" in
      'usdc()(address)') echo "\${MOCK_TOKEN:-${usdc}}" ;;
      'decimals()(uint8)') echo "\${MOCK_DECIMALS:-6}" ;;
      'balanceOf(address)(uint256)')
        if [[ "$4" == "${recipientA}" && -n "\${MOCK_RECIPIENT_BALANCE:-}" ]]; then
          echo "$MOCK_RECIPIENT_BALANCE"
        else echo "\${MOCK_TOKEN_BALANCE:-100000000}"; fi ;;
      'invoiceCount()(uint256)') echo 999 ;;
      'getInvoice(uint256)(address,address,address,uint256,uint16,uint64,uint8)')
        if [[ "\${MOCK_INVOICE_READ_FAIL:-}" == YES ]]; then echo 'RPC invoice lookup failed' >&2; exit 1; fi
        echo 1 ;;
      'payInvoice(uint256)')
        case "\${MOCK_DUPLICATE_RESULT:-expected}" in
          expected) echo 'Error: execution reverted: custom error 0x094311f1' >&2; exit 1 ;;
          decoded) echo 'Error: execution reverted: InvoiceNotOpen()' >&2; exit 1 ;;
          upper) echo 'Error: execution reverted: custom error 0x094311F1' >&2; exit 1 ;;
          success) echo 0x ;;
          rpc) echo 'Error: connection timeout' >&2; exit 1 ;;
          rpc-selector) echo 'Error: timeout while expecting 0x094311f1' >&2; exit 1 ;;
          wrong) echo 'Error: execution reverted: custom error 0xf04e9cf0' >&2; exit 1 ;;
          malformed) echo 'Error: execution reverted: custom error 0x094311f100' >&2; exit 1 ;;
        esac ;;
      *) echo 1 ;;
    esac ;;
  *) exit 9 ;;
esac
`);
  await writeFile(join(root, "bin/forge"), `#!/usr/bin/env bash
printf 'forge %s\\n' "$*" >>"$TRACE_LOG"
# A successful offline rehearsal only; this executable is still a stub and cannot broadcast.
if [[ "\${MOCK_PAYMENT_SUCCESS:-}" == YES ]]; then exit 0; fi
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

async function fixture({ profile = "kishore-v1", sourceCommit = mockHead, withEnv = true, withMetadata = true, envValues = {} } = {}) {
  const chain = join(root, "chain");
  await rm(join(chain, ".env"), { force: true });
  await rm(join(chain, "deployment-profile.json"), { force: true });
  await rm(join(chain, "deployments"), { recursive: true, force: true });
  const trace = join(root, `trace-${Math.random()}.log`);
  await writeFile(join(chain, "deployment-profile.json"), JSON.stringify({ approved: true, profile, sourceCommit }));
  if (withEnv) {
    const values = {
      PRIVATE_KEY: "TEST-ONLY-NOT-A-KEY", ARC_TESTNET_RPC_URL: "https://rpc.testnet.arc.io",
      ARCSPLIT_ADDRESS: chainAddress, RECIPIENT_A: recipientA, RECIPIENT_B: recipientB,
      DEMO_AMOUNT: "1000000", ARCSPLIT_RUNTIME_CODE_HASH: runtimeHash, ...envValues,
    };
    await writeFile(join(chain, ".env"), Object.entries(values).map(([key, value]) => `${key}='${String(value).replaceAll("'", "'\\''")}'`).join("\n") + "\n");
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
  const f = await fixture({ ...options, envValues: vars });
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
  for (const [vars, message] of [
    [{ RECIPIENT_A: "" }, /configure two valid recipient/],
    [{ RECIPIENT_A: recipientA, RECIPIENT_B: recipientA }, /recipient addresses must differ/],
    [{ RECIPIENT_A: chainAddress, RECIPIENT_B: recipientB }, /contract cannot receive/],
    [{ RECIPIENT_A: `0x${"00".repeat(20)}` }, /configure two valid recipient/],
  ]) {
    const { result } = await assertBlockedBeforeForge("payment", {}, { ARCSPLIT_CONFIRM_PAYMENT: "YES", ...vars });
    assert.match(result.stderr, message);
  }
});

test("zero, malformed, and underfunded payment amounts block", async () => {
  for (const vars of [
    { DEMO_AMOUNT: "0" }, { DEMO_AMOUNT: "1.5" }, { DEMO_AMOUNT: "100000001", MOCK_TOKEN_BALANCE: "100000000" },
  ]) await assertBlockedBeforeForge("payment", {}, { ARCSPLIT_CONFIRM_PAYMENT: "YES", ...vars });
});

test("malformed recipient balance blocks before the payment broadcast", async () => {
  const { result } = await assertBlockedBeforeForge("payment", {}, {
    ARCSPLIT_CONFIRM_PAYMENT: "YES", MOCK_RECIPIENT_BALANCE: "not-a-balance",
  });
  assert.match(result.stderr, /decimal uint256/);
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

test("valid payment reaches only the Forge stub on the system Bash", async () => {
  const f = await fixture();
  const result = invoke("payment", { ...f.env, ARCSPLIT_CONFIRM_PAYMENT: "YES" });
  assert.equal(result.status, 97, result.stderr);
  assert.match(await traceText(f.trace), /forge .*--broadcast/);
});

test("mixed-case reviewed hashes and contract addresses work on system Bash", async () => {
  const f = await fixture({ envValues: {
    ARCSPLIT_RUNTIME_CODE_HASH: `0x${"AB".repeat(32)}`, ARCSPLIT_ADDRESS: `0x${"CC".repeat(20)}`,
  } });
  const result = invoke("payment", { ...f.env, ARCSPLIT_CONFIRM_PAYMENT: "YES", MOCK_RUNTIME_HASH: `0x${"ab".repeat(32)}` });
  assert.equal(result.status, 97, result.stderr);
  assert.match(await traceText(f.trace), /forge .*--broadcast/);
});

test("native balance above signed 64-bit range remains positive", async () => {
  const f = await fixture();
  const result = invoke("deploy", { ...f.env, ARCSPLIT_CONFIRM_DEPLOY: "YES", MOCK_NATIVE_BALANCE: "10000000000000000000" });
  assert.equal(result.status, 97, result.stderr);
});

test("underfunded amounts cannot pass through integer wraparound", async () => {
  const { result } = await assertBlockedBeforeForge("payment", {}, {
    ARCSPLIT_CONFIRM_PAYMENT: "YES", DEMO_AMOUNT: "18446744073709551617", MOCK_TOKEN_BALANCE: "1",
  });
  assert.match(result.stderr, /payer needs enough/);
});

test("large sufficient token balances reach only the Forge stub", async () => {
  const f = await fixture();
  const result = invoke("payment", { ...f.env, ARCSPLIT_CONFIRM_PAYMENT: "YES", MOCK_TOKEN_BALANCE: "10000000000000000000" });
  assert.equal(result.status, 97, result.stderr);
});

test("amount arithmetic preserves uint256 limits and signed recipient deltas", () => {
  const run = (...args) => spawnSync(process.execPath, [join(repo, "script/amounts.mjs"), ...args], { encoding: "utf8" });
  const max = ((1n << 256n) - 1n).toString();
  assert.equal(run("enough", max, max).status, 0);
  assert.equal(run("enough", "0", "1").status, 1);
  assert.equal(run("delta", "0", max).stdout.trim(), max);
  assert.equal(run("delta", max, "0").stdout.trim(), `-${max}`);
  assert.equal(run("delta", "18446744073709551616", "18446744073709551617").stdout.trim(), "1");
  for (const value of ["-1", "1.5", "0x10", "01", "", "garbage", (1n << 256n).toString()]) {
    assert.equal(run("enough", value, "1").status, 2, value);
    assert.equal(run("enough", max, value).status, 2, value);
    assert.equal(run("delta", "0", value).status, 2, value);
  }
});

test("payment invoice identity comes from its own creation receipt even when receipts are reordered", async () => {
  const hash = `0x${"ab".repeat(32)}`;
  const payer = `0x${"aa".repeat(20)}`;
  const log = {
    address: chainAddress,
    topics: ["0xa64b246a5fea9dda213b3a1b2b2553a401a8cfe3ee7222f33e32ffddfcbdc1a7", `0x${"1".padStart(64, "0")}`, `0x${payer.slice(2).padStart(64, "0")}`],
  };
  const tx = { hash, function: "createInvoice(address,address,uint256,uint16,uint64)", transaction: { to: chainAddress } };
  const receipt = { transactionHash: hash, status: "0x1", gasUsed: "0x5208", logs: [log] };
  const path = join(root, "payment-broadcast.json");
  const run = async (transactions, receipts) => {
    await writeFile(path, JSON.stringify({ transactions, receipts, invoiceCount: "999" }));
    return spawnSync(process.execPath, [join(repo, "script/payment-invoice-id.mjs"), path, chainAddress, payer], { encoding: "utf8" });
  };
  const valid = await run([tx], [{ transactionHash: `0x${"cc".repeat(32)}`, logs: [] }, receipt]);
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(valid.stdout.trim(), "1");
  const f = await fixture();
  const broadcastDir = join(root, "chain/broadcast/DemoPayment.s.sol/5042002");
  await mkdir(broadcastDir, { recursive: true });
  await copyFile(path, join(broadcastDir, "run-latest.json"));
  const payment = invoke("payment", { ...f.env, ARCSPLIT_CONFIRM_PAYMENT: "YES", MOCK_PAYMENT_SUCCESS: "YES" });
  assert.equal(payment.status, 0, payment.stderr);
  const trace = await traceText(f.trace);
  assert.doesNotMatch(trace, /invoiceCount/);
  assert.match(trace, /getInvoice\(uint256\)\(address,address,address,uint256,uint16,uint64,uint8\) 1 --rpc-url/);
  assert.match(trace, /payInvoice\(uint256\) 1 --from/);
  for (const outcome of ["success", "rpc", "rpc-selector", "wrong", "malformed"]) {
    const duplicate = invoke("payment", { ...f.env, ARCSPLIT_CONFIRM_PAYMENT: "YES", MOCK_PAYMENT_SUCCESS: "YES", MOCK_DUPLICATE_RESULT: outcome });
    assert.equal(duplicate.status, 2, `${outcome}: ${duplicate.stderr}`);
    assert.match(duplicate.stderr, /duplicate settlement/);
    assert.doesNotMatch(duplicate.stdout, /gasUsed=/);
  }
  for (const outcome of ["decoded", "upper"]) {
    const decoded = invoke("payment", { ...f.env, ARCSPLIT_CONFIRM_PAYMENT: "YES", MOCK_PAYMENT_SUCCESS: "YES", MOCK_DUPLICATE_RESULT: outcome });
    assert.equal(decoded.status, 0, decoded.stderr);
  }
  const readFailure = invoke("payment", { ...f.env, ARCSPLIT_CONFIRM_PAYMENT: "YES", MOCK_PAYMENT_SUCCESS: "YES", MOCK_INVOICE_READ_FAIL: "YES" });
  assert.notEqual(readFailure.status, 0);
  assert.match(readFailure.stderr, /invoice lookup failed/);
  assert.doesNotMatch(readFailure.stdout, /gasUsed=/);
  for (const [transactions, receipts] of [
    [[], [receipt]], [[tx, tx], [receipt]], [[tx], []], [[tx], [receipt, receipt]],
    [[tx], [{ ...receipt, status: "0x0" }]], [[tx], [{ ...receipt, logs: [] }]],
    [[tx], [{ ...receipt, logs: [log, log] }]],
    [[tx], [{ ...receipt, logs: [{ ...log, address: recipientA }] }]],
    [[tx], [{ ...receipt, logs: [{ ...log, topics: [log.topics[0], log.topics[1], `0x${"bb".repeat(32)}`] }] }]],
    [[tx], [{ ...receipt, logs: [{ ...log, topics: [log.topics[0], `0x${"0".repeat(64)}`, log.topics[2]] }] }]],
  ]) {
    const rejected = await run(transactions, receipts);
    assert.equal(rejected.status, 2, rejected.stderr);
    assert.equal(rejected.stdout, "");
  }
});

test("broadcast summary matches receipts by hash and preserves exact gas usage", async () => {
  const path = join(root, "summary-broadcast.json");
  const a = `0x${"11".repeat(32)}`, b = `0x${"22".repeat(32)}`;
  const txs = [{ hash: a, function: "createInvoice()" }, { hash: b, function: "payInvoice()" }];
  const receipts = [
    { transactionHash: b, status: "0x1", gasUsed: "0x20000000000001" },
    { transactionHash: a, status: "0x1", gasUsed: "0x10" },
  ];
  const run = async (transactions, rs) => {
    await writeFile(path, JSON.stringify({ transactions, receipts: rs }));
    return spawnSync(process.execPath, [join(repo, "script/broadcast-summary.mjs"), path], { encoding: "utf8" });
  };
  const valid = await run(txs, receipts);
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /createInvoice\(\).*gasUsed=16/);
  assert.match(valid.stdout, /payInvoice\(\).*gasUsed=9007199254740993/);
  for (const [transactions, rs] of [
    [txs, []], [txs, [receipts[0]]], [txs, [...receipts, receipts[0]]],
    [txs, [{ ...receipts[0], status: "0x0" }, receipts[1]]],
    [txs, [{ ...receipts[0], gasUsed: "invalid" }, receipts[1]]],
    [[txs[0], txs[0]], receipts],
  ]) {
    const rejected = await run(transactions, rs);
    assert.equal(rejected.status, 2);
    assert.equal(rejected.stdout, "");
  }
});
