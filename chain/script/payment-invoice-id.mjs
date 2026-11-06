// Resolve the invoice created by this broadcast, never the mutable global invoice counter.
import { readFileSync } from "node:fs";

const createdTopic = "0xa64b246a5fea9dda213b3a1b2b2553a401a8cfe3ee7222f33e32ffddfcbdc1a7";
const address = /^0x[0-9a-f]{40}$/i;
const word = /^0x[0-9a-f]{64}$/i;
try {
  const [path, contract, payer, ...extra] = process.argv.slice(2);
  if (extra.length || !address.test(contract) || !address.test(payer)) throw new Error("Expected broadcast path, contract address and payer address");
  const run = JSON.parse(readFileSync(path, "utf8"));
  const transactions = run.transactions.filter((tx) => tx.function?.startsWith("createInvoice(")
    && (tx.transaction?.to ?? tx.contractAddress)?.toLowerCase() === contract.toLowerCase());
  if (transactions.length !== 1 || !word.test(transactions[0].hash)) throw new Error("Expected exactly one invoice creation transaction");
  const hash = transactions[0].hash.toLowerCase();
  const receipts = run.receipts.filter((receipt) => receipt.transactionHash?.toLowerCase() === hash);
  if (receipts.length !== 1 || receipts[0].status !== "0x1") throw new Error("Missing successful invoice creation receipt");
  const payerTopic = `0x${payer.slice(2).toLowerCase().padStart(64, "0")}`;
  const logs = receipts[0].logs.filter((log) => log.address?.toLowerCase() === contract.toLowerCase()
    && log.topics?.[0]?.toLowerCase() === createdTopic);
  if (logs.length !== 1 || logs[0].topics.length !== 3 || !word.test(logs[0].topics[1])
    || logs[0].topics[2]?.toLowerCase() !== payerTopic) throw new Error("Missing unambiguous InvoiceCreated event for this payer");
  const id = BigInt(logs[0].topics[1]);
  if (id === 0n) throw new Error("Invoice ID must be nonzero");
  console.log(id.toString());
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
