#!/usr/bin/env node
// Read-only deployment readiness check. Never reads .env, signs, broadcasts, or writes deployment metadata.
import { execFileSync } from "node:child_process";
import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const checks = [];
const add = (status, label, detail) => checks.push({ status, label, detail });
const command = (bin, args) => execFileSync(bin, args, { cwd: root, encoding: "utf8" }).trim();
const expectedUsdc = "0x3600000000000000000000000000000000000000";
const rpc = process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.io";

try {
  add("PASS", "Node", process.version);
  add("PASS", "Foundry", command("forge", ["--version"]).split("\n")[0]);
} catch (error) {
  add("FAIL", "Toolchain", error.message);
}

try {
  const status = command("git", ["status", "--porcelain"]);
  const commit = command("git", ["rev-parse", "HEAD"]);
  add(status ? "BLOCKED" : "PASS", "Git source snapshot", `${commit}${status ? " (working tree has changes)" : " (clean)"}`);
} catch (error) {
  add("FAIL", "Git source snapshot", error.message);
}

try {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const foundry = await readFile(join(root, "foundry.toml"), "utf8");
  add(pkg.dependencies?.["@openzeppelin/contracts"] === "5.1.0" ? "PASS" : "FAIL", "OpenZeppelin pin", String(pkg.dependencies?.["@openzeppelin/contracts"]));
  add(foundry.includes('solc_version = "0.8.28"') && foundry.includes("optimizer_runs = 200") ? "PASS" : "FAIL", "Solidity build settings", "solc 0.8.28; optimizer 200 runs expected");
  command("forge", ["build"]);
  const artifact = JSON.parse(await readFile(join(root, "out/ArcSplit.sol/ArcSplit.json"), "utf8"));
  const abi = JSON.parse(await readFile(join(root, "abi/ArcSplit.json"), "utf8"));
  const built = JSON.stringify(artifact.abi);
  const exported = JSON.stringify(abi);
  add(built === exported ? "PASS" : "FAIL", "ABI export consistency", built === exported ? `${abi.length} entries match compiled artifact` : "Run ABI review; tracked ABI differs from compiled artifact");
  add(artifact.metadata?.compiler?.version?.startsWith("0.8.28") ? "PASS" : "FAIL", "Compiler artifact", String(artifact.metadata?.compiler?.version));
} catch (error) {
  add("FAIL", "Reproducible build and ABI", error.message);
}

try {
  const selection = JSON.parse(await readFile(join(root, "deployment-profile.json"), "utf8"));
  add(selection.approved === true && selection.profile === "kishore-v1" ? "PASS" : "BLOCKED", "Owner profile approval", "The source/profile must be explicitly approved by the contract owner");
} catch {
  add("BLOCKED", "Owner profile approval", "chain/deployment-profile.json is absent; do not infer approval from the branch name");
}

try {
  const response = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) });
  const body = await response.json();
  add(response.ok && body.result === "0x4cef52" ? "PASS" : "FAIL", "Arc Testnet RPC chain ID", `${rpc}: ${body.result ?? body.error?.message ?? response.status}`);
  const decimalsResponse = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_call", params: [{ to: expectedUsdc, data: "0x313ce567" }, "latest"] }) });
  const decimalsBody = await decimalsResponse.json();
  const decimals = decimalsBody.result ? Number(BigInt(decimalsBody.result)) : NaN;
  add(decimalsResponse.ok && decimals === 6 ? "PASS" : "FAIL", "Official USDC ERC-20 decimals", `${expectedUsdc}: ${Number.isFinite(decimals) ? decimals : decimalsBody.error?.message ?? "RPC error"}`);
} catch (error) {
  add("BLOCKED", "Read-only Arc RPC checks", error.message);
}

try {
  await access(join(root, "deployments/arc-testnet.json"));
  const deployment = JSON.parse(await readFile(join(root, "deployments/arc-testnet.json"), "utf8"));
  const valid = deployment.chainId === 5042002 && deployment.usdcAddress?.toLowerCase() === expectedUsdc && deployment.usdcDecimals === 6 && /^0x[0-9a-f]{40}$/i.test(deployment.contractAddress ?? "") && /^0x[0-9a-f]{64}$/i.test(deployment.deploymentTransactionHash ?? "") && Number.isSafeInteger(deployment.deploymentBlock) && deployment.deploymentBlock >= 0 && typeof deployment.compilerVersion === "string" && typeof deployment.sourceCommit === "string" && /^https:\/\/explorer\.testnet\.arc\.io\//.test(deployment.explorerUrl ?? "");
  add(valid ? "PASS" : "FAIL", "Deployment metadata schema", valid ? "Required receipt-backed fields are present" : "Missing or malformed deployment fields");
} catch {
  add("BLOCKED", "Deployment metadata", "No verified Arc Testnet deployment artifact exists");
}

add("NOT RUN", "Wallet and recipient readiness", "No wallet/private key or recipient values were read; human review is required");
add("BLOCKED", "Deployment authorization", "Separate human authorization and an approved team-controlled wallet are required");

for (const check of checks) console.log(`${check.status.padEnd(8)} ${check.label}: ${check.detail}`);
const blocked = checks.some(({ status }) => status === "BLOCKED" || status === "FAIL");
console.log(`\nOverall: ${blocked ? "BLOCKED — preflight does not authorize a broadcast" : "PASS — readiness checks only; deployment still requires separate authorization"}`);
process.exitCode = blocked ? 2 : 0;
