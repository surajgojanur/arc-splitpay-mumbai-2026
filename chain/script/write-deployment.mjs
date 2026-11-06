// Writes chain/deployments/arc-testnet.json from the latest Foundry broadcast of Deploy.s.sol.
// Only real broadcast receipts are used; nothing is filled in by hand.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = JSON.parse(readFileSync(join(root, "broadcast/Deploy.s.sol/5042002/run-latest.json"), "utf8"));
const tx = run.transactions?.find((t) => t.transactionType === "CREATE" && t.contractName === "ArcSplit");
const hashPattern = /^0x[0-9a-f]{64}$/i;
const addressPattern = /^0x[0-9a-f]{40}$/i;
const quantityPattern = /^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
if (!tx || !hashPattern.test(tx.hash) || !addressPattern.test(tx.contractAddress)
  || /^0x0{40}$/i.test(tx.contractAddress)) throw new Error("No valid ArcSplit CREATE transaction in broadcast");
const receipt = run.receipts?.find((r) => r.transactionHash?.toLowerCase() === tx.hash.toLowerCase());
if (!receipt || receipt.status !== "0x1" || !quantityPattern.test(receipt.blockNumber)
  || !hashPattern.test(receipt.blockHash)
  || receipt.contractAddress?.toLowerCase() !== tx.contractAddress.toLowerCase())
  throw new Error("No successful matching ArcSplit CREATE receipt in broadcast");
// Re-check against the public Arc Testnet RPC so a local fork broadcast (same chain id) can never be recorded.
const RPC = "https://rpc.testnet.arc.io";
const rpc = async (method, params) => {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  if (!r.ok) throw new Error(`${method}: RPC HTTP ${r.status}`);
  const body = await r.json();
  if (!body || body.error || !Object.hasOwn(body, "result"))
    throw new Error(`${method}: RPC error or missing result`);
  return body.result;
};
if (await rpc("eth_chainId", []) !== "0x4cef52") throw new Error("RPC is not Arc Testnet (5042002)");
const live = await rpc("eth_getTransactionReceipt", [tx.hash]);
if (!live || live.status !== "0x1" || live.contractAddress?.toLowerCase() !== tx.contractAddress.toLowerCase()
  || live.transactionHash?.toLowerCase() !== tx.hash.toLowerCase()
  || !quantityPattern.test(live.blockNumber) || live.blockNumber.toLowerCase() !== receipt.blockNumber.toLowerCase()
  || live.blockHash?.toLowerCase() !== receipt.blockHash.toLowerCase())
  throw new Error(`Deployment tx ${tx.hash} not found/successful on ${RPC}`);
const code = await rpc("eth_getCode", [tx.contractAddress, "latest"]);
if (typeof code !== "string" || !/^0x(?:[0-9a-f]{2})+$/i.test(code))
  throw new Error("No valid code at address on Arc Testnet");
const deploymentBlock = Number(BigInt(live.blockNumber));
if (!Number.isSafeInteger(deploymentBlock)) throw new Error("Deployment block is not a safe integer");
const artifact = JSON.parse(readFileSync(join(root, "out/ArcSplit.sol/ArcSplit.json"), "utf8"));
const explorer = "https://explorer.testnet.arc.io";
const out = {
  chainId: 5042002,
  contractAddress: tx.contractAddress,
  usdcAddress: "0x3600000000000000000000000000000000000000",
  usdcDecimals: 6,
  deploymentBlock,
  deploymentTransactionHash: tx.hash,
  compilerVersion: artifact.metadata.compiler.version,
  sourceCommit: process.env.SOURCE_COMMIT ?? execSync("git rev-parse HEAD", { cwd: root }).toString().trim(),
  explorerUrl: `${explorer}/address/${tx.contractAddress}`,
};
mkdirSync(join(root, "deployments"), { recursive: true });
writeFileSync(join(root, "deployments/arc-testnet.json"), JSON.stringify(out, null, 2) + "\n");
console.log(out);
