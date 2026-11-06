// Validate every receipt before printing any transaction as successful evidence.
import { readFileSync } from "node:fs";

try {
  const [path, ...extra] = process.argv.slice(2);
  if (!path || extra.length) throw new Error("Expected one broadcast JSON path");
  const run = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(run.transactions) || !run.transactions.length || !Array.isArray(run.receipts))
    throw new Error("Missing broadcast transactions or receipts");
  const seen = new Set();
  const lines = run.transactions.map((tx) => {
    if (typeof tx.hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(tx.hash) || seen.has(tx.hash.toLowerCase()))
      throw new Error("Missing or duplicate broadcast transaction hash");
    seen.add(tx.hash.toLowerCase());
    const matches = run.receipts.filter((r) => r.transactionHash?.toLowerCase() === tx.hash.toLowerCase());
    if (matches.length !== 1 || matches[0].status !== "0x1")
      throw new Error(`No unique successful receipt for ${tx.hash}`);
    const receipt = matches[0];
    if (typeof receipt.gasUsed !== "string" || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(receipt.gasUsed))
      throw new Error(`Invalid gas usage for ${tx.hash}`);
    return `${tx.function ?? tx.transactionType} ${tx.hash} gasUsed=${BigInt(receipt.gasUsed)} status=${receipt.status} https://explorer.testnet.arc.io/tx/${tx.hash}`;
  });
  console.log(lines.join("\n"));
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
