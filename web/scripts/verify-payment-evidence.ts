import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  createPublicClient,
  decodeEventLog,
  decodeFunctionData,
  erc20Abi,
  getEventSelector,
  http,
  isAddress,
  keccak256,
  toBytes,
  type Abi,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { arc, USDC } from "../lib/network.ts";
import { studioAbi } from "../lib/contracts/studio-abi.ts";
import { kishoreAbi } from "../lib/contracts/kishore-abi.ts";

export type ContractProfile = "studio-v1" | "kishore-v1";
export type PaymentDeployment = {
  profile: ContractProfile;
  chainId: number;
  contractAddress: Address;
  usdcAddress: Address;
  usdcDecimals: number;
  deploymentBlock: bigint | number | string;
  deploymentTransactionHash: Hash;
  runtimeCodeHash: Hash;
  abiHash: Hash;
  explorerUrl: string;
};
type Tx = {
  hash: Hash;
  from: Address;
  to: Address | null;
  input: Hex;
  chainId: number | null;
};
type Log = {
  address: Address;
  data: Hex;
  topics: readonly Hex[];
  transactionHash: Hash;
  blockNumber: bigint;
};
type Receipt = {
  transactionHash: Hash;
  blockNumber: bigint;
  status: "success" | "reverted";
  contractAddress?: Address | null;
  logs: readonly Log[];
};
export type EvidenceRpc = {
  getChainId(): Promise<number>;
  getCode(args: { address: Address }): Promise<Hex | undefined>;
  getTransaction(args: { hash: Hash }): Promise<Tx | null>;
  getTransactionReceipt(args: { hash: Hash }): Promise<Receipt>;
  readContract(args: never): Promise<unknown>;
};
export type PaymentEvidence = {
  chainId: number;
  network: string;
  profile: ContractProfile;
  contractAddress: Address;
  usdcAddress: Address;
  usdcDecimals: 6;
  invoiceId: string;
  payer: Address;
  amount: string;
  shareBps: number;
  recipientA: Address;
  recipientB: Address;
  payoutA: string;
  payoutB: string;
  transactionHash: Hash;
  blockNumber: string;
  status: "success";
  invoicePaidEventVerified: true;
  transferAVerified: true;
  transferBVerified: true;
  explorerUrl: string;
  verificationResult: "VERIFIED";
  verificationTimestamp: string;
};
const abis: Record<ContractProfile, Abi> = {
  "studio-v1": studioAbi,
  "kishore-v1": kishoreAbi,
};
const ZERO = "0x0000000000000000000000000000000000000000";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const validHash = (v: unknown): v is Hash =>
  typeof v === "string" &&
  /^0x[\da-fA-F]{64}$/.test(v) &&
  !/^0x0{64}$/i.test(v);
const fail = (message: string): never => {
  throw new Error(message);
};

function checkedDeployment(d: PaymentDeployment): ContractProfile {
  if (d.profile !== "studio-v1" && d.profile !== "kishore-v1")
    fail("Deployment config must explicitly select a supported ABI profile.");
  if (
    d.chainId !== arc.id ||
    !isAddress(d.contractAddress) ||
    same(d.contractAddress, ZERO) ||
    same(d.contractAddress, USDC) ||
    !same(d.usdcAddress, USDC) ||
    d.usdcDecimals !== 6 ||
    d.explorerUrl !== arc.blockExplorers.default.url ||
    !validHash(d.deploymentTransactionHash) ||
    !validHash(d.runtimeCodeHash) ||
    (typeof d.deploymentBlock === "number" &&
      !Number.isSafeInteger(d.deploymentBlock)) ||
    !/^\d+$/.test(String(d.deploymentBlock)) ||
    BigInt(d.deploymentBlock) < 0n
  )
    fail("Deployment metadata is missing or invalid for Arc Testnet.");
  const expectedHash = keccak256(toBytes(JSON.stringify(abis[d.profile])));
  if (!same(d.abiHash, expectedHash))
    fail("Deployment ABI fingerprint does not match its explicit profile.");
  return d.profile;
}

function parseInvoice(profile: ContractProfile, raw: unknown) {
  let payer: unknown,
    recipientA: unknown,
    recipientB: unknown,
    amount: unknown,
    shareBps: unknown,
    status: unknown;
  if (profile === "studio-v1") {
    const tuple = Array.isArray(raw) && raw.length === 1 ? raw[0] : raw;
    if (Array.isArray(tuple)) {
      payer = tuple[1];
      recipientA = tuple[2];
      recipientB = tuple[3];
      amount = tuple[4];
      shareBps = tuple[5];
      status = tuple[10];
    } else if (tuple && typeof tuple === "object") {
      const v = tuple as Record<string, unknown>;
      ({ payer, recipientA, recipientB, amount, status } = v);
      shareBps = v.bpsA;
    }
  } else if (Array.isArray(raw) && raw.length === 7) {
    [payer, recipientA, recipientB, amount, shareBps, , status] = raw;
  }
  if (
    typeof payer !== "string" ||
    !isAddress(payer) ||
    same(payer, ZERO) ||
    typeof recipientA !== "string" ||
    !isAddress(recipientA) ||
    same(recipientA, ZERO) ||
    typeof recipientB !== "string" ||
    !isAddress(recipientB) ||
    same(recipientB, ZERO) ||
    same(recipientA, recipientB) ||
    typeof amount !== "bigint" ||
    amount <= 0n ||
    (typeof shareBps !== "number" && typeof shareBps !== "bigint") ||
    BigInt(shareBps) < 1n ||
    BigInt(shareBps) > 9999n ||
    BigInt(status as bigint | number) !== 2n
  )
    fail("Onchain invoice is not a valid paid split invoice.");
  const validAmount = amount as bigint;
  const bps = Number(shareBps),
    payoutA = (validAmount * BigInt(bps)) / 10_000n,
    payoutB = validAmount - payoutA;
  if (payoutA <= 0n || payoutB <= 0n)
    fail("Onchain invoice does not have two positive payouts.");
  return {
    payer: payer as Address,
    recipientA: recipientA as Address,
    recipientB: recipientB as Address,
    amount: validAmount,
    shareBps: bps,
    payoutA,
    payoutB,
  };
}

export async function verifyPaymentEvidence(
  client: EvidenceRpc,
  d: PaymentDeployment,
  hash: Hash,
  timestamp = new Date().toISOString(),
): Promise<PaymentEvidence> {
  if (!validHash(hash)) fail("Malformed payment transaction hash.");
  const profile = checkedDeployment(d);
  if ((await client.getChainId()) !== arc.id)
    fail("RPC is connected to the wrong chain.");
  const [deployReceipt, code, configuredUsdc, decimals] = await Promise.all([
    client.getTransactionReceipt({ hash: d.deploymentTransactionHash }),
    client.getCode({ address: d.contractAddress }),
    client.readContract({
      address: d.contractAddress,
      abi: abis[profile],
      functionName: "usdc",
    } as never),
    client.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "decimals",
    } as never),
  ]);
  if (
    deployReceipt.status !== "success" ||
    !same(deployReceipt.transactionHash, d.deploymentTransactionHash) ||
    !deployReceipt.contractAddress ||
    !same(deployReceipt.contractAddress, d.contractAddress) ||
    deployReceipt.blockNumber !== BigInt(d.deploymentBlock)
  )
    fail("Deployment receipt does not match the configured direct deployment.");
  if (!code || code === "0x" || !same(keccak256(code), d.runtimeCodeHash))
    fail("Contract runtime code does not match reviewed deployment metadata.");
  if (
    typeof configuredUsdc !== "string" ||
    !same(configuredUsdc, USDC) ||
    decimals !== 6
  )
    fail("Deployed contract does not use official six-decimal Arc USDC.");

  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash }),
    client.getTransactionReceipt({ hash }),
  ]);
  if (!tx) return fail("Payment transaction was not found by the RPC.");
  if (tx.chainId !== null && tx.chainId !== arc.id)
    fail("Transaction chain ID is not Arc Testnet.");
  if (!tx.to || !same(tx.to, d.contractAddress))
    fail("Payment transaction target does not match the configured contract.");
  if (!same(tx.hash, hash) || !same(receipt.transactionHash, hash))
    fail("Transaction or receipt hash mismatch.");
  if (receipt.status !== "success") fail("Payment transaction reverted.");
  if (receipt.blockNumber < BigInt(d.deploymentBlock))
    fail("Payment receipt predates the contract deployment.");

  const abi = abis[profile];
  let call:
    { functionName: string; args: readonly unknown[] | undefined } | undefined;
  try {
    call = decodeFunctionData({ abi, data: tx.input }) as typeof call;
  } catch {
    return fail(
      "Payment calldata cannot be decoded with the selected profile ABI.",
    );
  }
  if (!call)
    return fail(
      "Payment calldata cannot be decoded with the selected profile ABI.",
    );
  const method = profile === "studio-v1" ? "settleInvoice" : "payInvoice";
  if (call.functionName !== method || !call.args || call.args.length !== 1)
    return fail(
      "Transaction method does not match the selected invoice-payment profile.",
    );
  const invoiceId = BigInt(call.args[0] as bigint);
  const rawInvoice = await client.readContract({
    address: d.contractAddress,
    abi,
    functionName: "getInvoice",
    args: [invoiceId],
  } as never);
  const invoice = parseInvoice(profile, rawInvoice);
  if (!same(tx.from, invoice.payer))
    fail("Transaction sender is not the invoice payer.");

  const paidEvent = abi.find(
    (item) => item.type === "event" && item.name === "InvoicePaid",
  );
  if (!paidEvent || paidEvent.type !== "event")
    return fail("Selected ABI has no InvoicePaid event.");
  const paidTopic = getEventSelector(paidEvent);
  const paidLogs: Array<Record<string, unknown>> = [];
  for (const log of receipt.logs) {
    if (
      !same(log.address, d.contractAddress) ||
      log.topics[0]?.toLowerCase() !== paidTopic.toLowerCase()
    )
      continue;
    if (
      !same(log.transactionHash, hash) ||
      log.blockNumber !== receipt.blockNumber
    )
      fail("InvoicePaid log is attached to a different transaction or block.");
    try {
      const decoded = decodeEventLog({
        abi,
        data: log.data,
        topics: [...log.topics] as [Hex, ...Hex[]],
      });
      if (decoded.eventName !== "InvoicePaid")
        fail("Contract payment log could not be decoded.");
      paidLogs.push(decoded.args as unknown as Record<string, unknown>);
    } catch {
      fail("Contract payment log is malformed for the selected profile.");
    }
  }
  if (paidLogs.length !== 1)
    fail("Receipt must contain exactly one InvoicePaid event.");
  const paid = paidLogs[0];
  if (
    BigInt(paid.id as bigint) !== invoiceId ||
    typeof paid.payer !== "string" ||
    !same(paid.payer, invoice.payer) ||
    BigInt(paid.amount as bigint) !== invoice.amount ||
    BigInt(paid.payoutA as bigint) !== invoice.payoutA ||
    BigInt(paid.payoutB as bigint) !== invoice.payoutB ||
    (profile === "studio-v1" &&
      (typeof paid.recipientA !== "string" ||
        !same(paid.recipientA, invoice.recipientA) ||
        typeof paid.recipientB !== "string" ||
        !same(paid.recipientB, invoice.recipientB)))
  )
    fail("InvoicePaid event does not match the paid invoice and exact split.");

  const transferEvents: Array<{ from: Address; to: Address; value: bigint }> =
    [];
  for (const log of receipt.logs) {
    if (
      !same(log.address, USDC) ||
      log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC
    )
      continue;
    if (
      !same(log.transactionHash, hash) ||
      log.blockNumber !== receipt.blockNumber
    )
      fail(
        "USDC Transfer log is attached to a different transaction or block.",
      );
    try {
      const event = decodeEventLog({
        abi: erc20Abi,
        eventName: "Transfer",
        data: log.data,
        topics: [...log.topics] as [Hex, ...Hex[]],
      });
      transferEvents.push(
        event.args as { from: Address; to: Address; value: bigint },
      );
    } catch {
      fail("USDC Transfer log is malformed.");
    }
  }
  const relevant = transferEvents.filter(
    (e) =>
      same(e.from, invoice.payer) &&
      (same(e.to, invoice.recipientA) || same(e.to, invoice.recipientB)),
  );
  const toA = relevant.filter((e) => same(e.to, invoice.recipientA)),
    toB = relevant.filter((e) => same(e.to, invoice.recipientB));
  if (
    transferEvents.length !== 2 ||
    relevant.length !== 2 ||
    toA.length !== 1 ||
    toB.length !== 1 ||
    toA[0].value !== invoice.payoutA ||
    toB[0].value !== invoice.payoutB
  )
    fail(
      "Receipt does not prove exactly one correct USDC transfer to each recipient.",
    );

  return {
    chainId: arc.id,
    network: arc.name,
    profile,
    contractAddress: d.contractAddress,
    usdcAddress: USDC,
    usdcDecimals: 6,
    invoiceId: invoiceId.toString(),
    payer: invoice.payer,
    amount: invoice.amount.toString(),
    shareBps: invoice.shareBps,
    recipientA: invoice.recipientA,
    recipientB: invoice.recipientB,
    payoutA: invoice.payoutA.toString(),
    payoutB: invoice.payoutB.toString(),
    transactionHash: hash,
    blockNumber: receipt.blockNumber.toString(),
    status: "success",
    invoicePaidEventVerified: true,
    transferAVerified: true,
    transferBVerified: true,
    explorerUrl: `${arc.blockExplorers.default.url}/tx/${hash}`,
    verificationResult: "VERIFIED",
    verificationTimestamp: timestamp,
  };
}

async function main() {
  const [hash, requestedId, format = "text"] = process.argv.slice(2);
  if (
    !validHash(hash) ||
    !requestedId ||
    !/^\d+$/.test(requestedId) ||
    !["text", "json"].includes(format)
  )
    throw new Error(
      "Usage: npm run verify:payment -w web -- 0x<transaction-hash> <invoice-id> [text|json]",
    );
  const d = JSON.parse(
    await readFile(
      new URL("../config/deployment.json", import.meta.url),
      "utf8",
    ),
  ) as PaymentDeployment | null;
  if (!d)
    throw new Error(
      "No verified deployment metadata is configured; real payment verification is unavailable.",
    );
  const client = createPublicClient({
    chain: arc,
    transport: http(process.env.ARC_TESTNET_RPC_URL || undefined),
  });
  const proof = await verifyPaymentEvidence(
    client as unknown as EvidenceRpc,
    d,
    hash,
  );
  if (proof.invoiceId !== BigInt(requestedId).toString())
    throw new Error(
      "Transaction invoice ID differs from the requested invoice ID.",
    );
  console.log(
    format === "json"
      ? JSON.stringify(proof, null, 2)
      : [
          "VERIFIED Arc Testnet split payment",
          `Profile: ${proof.profile}; invoice: ${proof.invoiceId}`,
          `Amount: ${proof.amount} atomic USDC; ${proof.shareBps}/10000 → ${proof.payoutA} + ${proof.payoutB}`,
          `Payer: ${proof.payer}`,
          `Recipients: ${proof.recipientA} (${proof.payoutA}), ${proof.recipientB} (${proof.payoutB})`,
          `Transaction: ${proof.transactionHash}`,
          `Explorer: ${proof.explorerUrl}`,
        ].join("\n"),
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch((e: unknown) => {
    console.error(`UNVERIFIED: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  });
