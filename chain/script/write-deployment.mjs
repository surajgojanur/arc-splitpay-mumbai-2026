// Writes chain/deployments/arc-testnet.json from the latest Foundry broadcast of Deploy.s.sol.
// Only real broadcast receipts are used; nothing is filled in by hand.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = JSON.parse(readFileSync(join(root, "broadcast/Deploy.s.sol/5042002/run-latest.json"), "utf8"));
const tx = run.transactions.find((t) => t.transactionType === "CREATE" && t.contractName === "ArcSplit");
const receipt = run.receipts.find((r) => r.transactionHash === tx.hash);
if (!tx || !receipt || receipt.status !== "0x1") throw new Error("No successful ArcSplit CREATE receipt in broadcast");
// Re-check against the public Arc Testnet RPC so a local fork broadcast (same chain id) can never be recorded.
const RPC = "https://rpc.testnet.arc.io";
const rpc = async (method, params) => {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return (await r.json()).result;
};
const live = await rpc("eth_getTransactionReceipt", [tx.hash]);
if (!live || live.status !== "0x1" || live.contractAddress?.toLowerCase() !== tx.contractAddress.toLowerCase())
  throw new Error(`Deployment tx ${tx.hash} not found/successful on ${RPC}`);
if ((await rpc("eth_getCode", [tx.contractAddress, "latest"])) === "0x") throw new Error("No code at address on Arc Testnet");
const artifact = JSON.parse(readFileSync(join(root, "out/ArcSplit.sol/ArcSplit.json"), "utf8"));
const explorer = "https://explorer.testnet.arc.io";
const out = {
  chainId: 5042002,
  contractAddress: tx.contractAddress,
  usdcAddress: "0x3600000000000000000000000000000000000000",
  usdcDecimals: 6,
  deploymentBlock: Number(BigInt(live.blockNumber)),
  deploymentTransactionHash: tx.hash,
  compilerVersion: artifact.metadata.compiler.version,
  sourceCommit: process.env.SOURCE_COMMIT ?? execSync("git rev-parse HEAD", { cwd: root }).toString().trim(),
  explorerUrl: `${explorer}/address/${tx.contractAddress}`,
};
mkdirSync(join(root, "deployments"), { recursive: true });
writeFileSync(join(root, "deployments/arc-testnet.json"), JSON.stringify(out, null, 2) + "\n");
console.log(out);
