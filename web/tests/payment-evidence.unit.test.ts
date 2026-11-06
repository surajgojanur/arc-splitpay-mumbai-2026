import { describe, expect, it } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  keccak256,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { abis, abiHash, type Profile } from "../lib/contracts/profiles";
import { arc, USDC } from "../lib/network";
import {
  verifyPaymentEvidence,
  type EvidenceRpc,
  type PaymentDeployment,
} from "../scripts/verify-payment-evidence";

const contract = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
const payer = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const recipientA = "0x1111111111111111111111111111111111111111" as Address;
const recipientB = "0x2222222222222222222222222222222222222222" as Address;
const deploymentHash = `0x${"d1".repeat(32)}` as Hash;
const paymentHash = `0x${"a1".repeat(32)}` as Hash;
const code = "0x6000" as const;
const runtimeCodeHash = keccak256(code);
const invoiceId = 7n;
const amount = 100_000_000n;
const payoutA = 70_000_000n;
const payoutB = 30_000_000n;
const blockNumber = 900n;

function fixture(profile: Profile = "studio-v1") {
  const abi = abis[profile];
  const deployment: PaymentDeployment = {
    profile,
    chainId: arc.id,
    contractAddress: contract,
    usdcAddress: USDC,
    usdcDecimals: 6,
    deploymentBlock: 800n,
    deploymentTransactionHash: deploymentHash,
    runtimeCodeHash,
    abiHash: abiHash(profile),
    explorerUrl: arc.blockExplorers.default.url,
  };
  const paymentInput = encodeFunctionData({
    abi,
    functionName: profile === "studio-v1" ? "settleInvoice" : "payInvoice",
    args: [invoiceId],
  });
  const paidEvent = abi.find(
    (item) => item.type === "event" && item.name === "InvoicePaid",
  );
  if (!paidEvent || paidEvent.type !== "event")
    throw new Error("Fixture ABI missing InvoicePaid");
  const paidArgs =
    profile === "studio-v1"
      ? {
          id: invoiceId,
          payer,
          recipientA,
          recipientB,
          payoutA,
          payoutB,
          amount,
        }
      : { id: invoiceId, payer, amount, payoutA, payoutB };
  const normalizeTopics = (topics: readonly (Hex | Hex[] | null)[]) =>
    topics.filter((topic): topic is Hex => typeof topic === "string");
  const paidLog = {
    topics: normalizeTopics(
      encodeEventTopics({
        abi: [paidEvent],
        eventName: "InvoicePaid",
        args: paidArgs,
      } as never),
    ),
    data:
      profile === "studio-v1"
        ? encodeAbiParameters(
            [
              { type: "address" },
              { type: "address" },
              { type: "uint256" },
              { type: "uint256" },
              { type: "uint256" },
            ],
            [recipientA, recipientB, payoutA, payoutB, amount],
          )
        : encodeAbiParameters(
            [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
            [amount, payoutA, payoutB],
          ),
  };
  const transferAbi = [
    {
      type: "event",
      name: "Transfer",
      anonymous: false,
      inputs: [
        { name: "from", type: "address", indexed: true },
        { name: "to", type: "address", indexed: true },
        { name: "value", type: "uint256", indexed: false },
      ],
    },
  ] as const;
  const transferA = {
    topics: normalizeTopics(
      encodeEventTopics({
        abi: transferAbi,
        eventName: "Transfer",
        args: { from: payer, to: recipientA },
      }),
    ),
    data: encodeAbiParameters([{ type: "uint256" }], [payoutA]),
  };
  const transferB = {
    topics: normalizeTopics(
      encodeEventTopics({
        abi: transferAbi,
        eventName: "Transfer",
        args: { from: payer, to: recipientB },
      }),
    ),
    data: encodeAbiParameters([{ type: "uint256" }], [payoutB]),
  };
  const log = (
    address: Address,
    encoded: { data: `0x${string}`; topics: readonly `0x${string}`[] },
  ) => ({
    address,
    data: encoded.data,
    topics: encoded.topics,
    transactionHash: paymentHash,
    blockNumber,
  });
  const deployReceipt = {
    transactionHash: deploymentHash,
    blockNumber: 800n,
    status: "success" as const,
    contractAddress: contract,
    logs: [],
  };
  let receipt: {
    transactionHash: Hash;
    blockNumber: bigint;
    status: "success" | "reverted";
    logs: ReturnType<typeof log>[];
  } = {
    transactionHash: paymentHash,
    blockNumber,
    status: "success",
    logs: [log(contract, paidLog), log(USDC, transferA), log(USDC, transferB)],
  };
  const tx = {
    hash: paymentHash,
    from: payer,
    to: contract,
    input: paymentInput,
    chainId: arc.id,
  };
  const client: EvidenceRpc = {
    getChainId: async () => arc.id,
    getCode: async () => code,
    getTransaction: async () => tx,
    getTransactionReceipt: async ({ hash }) =>
      hash === deploymentHash ? deployReceipt : receipt,
    readContract: async (args: never) => {
      const call = args as unknown as { functionName: string };
      if (call.functionName === "usdc") return USDC;
      if (call.functionName === "decimals") return 6;
      return profile === "studio-v1"
        ? {
            creator: payer,
            payer,
            recipientA,
            recipientB,
            amount,
            bpsA: 7000,
            status: 2,
          }
        : [payer, recipientA, recipientB, amount, 7000, 9999999999n, 2];
    },
  };
  return {
    deployment,
    client,
    setReceipt: (next: typeof receipt) => {
      receipt = next;
    },
    paidLog,
    transferA,
    transferB,
    log,
  };
}

describe("read-only payment evidence verifier (deterministic fixtures)", () => {
  it.each(["studio-v1", "kishore-v1"] as const)(
    "verifies exact %s payment logs",
    async (profile) => {
      const f = fixture(profile);
      const result = await verifyPaymentEvidence(
        f.client,
        f.deployment,
        paymentHash,
        "2026-11-06T00:00:00.000Z",
      );
      expect(result).toMatchObject({
        profile,
        invoiceId: "7",
        amount: "100000000",
        payoutA: "70000000",
        payoutB: "30000000",
        verificationResult: "VERIFIED",
      });
    },
  );

  it("rejects wrong chain and explicit ABI fingerprint before reading evidence", async () => {
    const f = fixture();
    f.client.getChainId = async () => 1;
    await expect(
      verifyPaymentEvidence(f.client, f.deployment, paymentHash),
    ).rejects.toThrow("wrong chain");
    f.client.getChainId = async () => arc.id;
    await expect(
      verifyPaymentEvidence(
        f.client,
        { ...f.deployment, abiHash: `0x${"00".repeat(32)}` as Hash },
        paymentHash,
      ),
    ).rejects.toThrow("ABI fingerprint");
  });

  it("rejects missing, duplicate, or incorrectly paid transfer evidence", async () => {
    const f = fixture();
    f.setReceipt({
      transactionHash: paymentHash,
      blockNumber,
      status: "success",
      logs: [f.log(contract, f.paidLog), f.log(USDC, f.transferA)],
    });
    await expect(
      verifyPaymentEvidence(f.client, f.deployment, paymentHash),
    ).rejects.toThrow("exactly one correct USDC transfer");
    f.setReceipt({
      transactionHash: paymentHash,
      blockNumber,
      status: "success",
      logs: [
        f.log(contract, f.paidLog),
        f.log(USDC, f.transferA),
        f.log(USDC, f.transferA),
        f.log(USDC, f.transferB),
      ],
    });
    await expect(
      verifyPaymentEvidence(f.client, f.deployment, paymentHash),
    ).rejects.toThrow("exactly one correct USDC transfer");
  });

  it("rejects reverted and transaction-hash-mismatched receipts", async () => {
    const f = fixture();
    f.setReceipt({
      transactionHash: paymentHash,
      blockNumber,
      status: "reverted",
      logs: [],
    });
    await expect(
      verifyPaymentEvidence(f.client, f.deployment, paymentHash),
    ).rejects.toThrow("reverted");
    f.setReceipt({
      transactionHash: `0x${"bb".repeat(32)}` as Hash,
      blockNumber,
      status: "success",
      logs: [],
    });
    await expect(
      verifyPaymentEvidence(f.client, f.deployment, paymentHash),
    ).rejects.toThrow("hash mismatch");
  });

  it("rejects malformed transaction hashes", async () => {
    const f = fixture();
    await expect(
      verifyPaymentEvidence(f.client, f.deployment, "0x1234" as Hash),
    ).rejects.toThrow("Malformed");
  });

  it("rejects a wrong contract target, payment method, or payer", async () => {
    const f = fixture();
    const original = f.client.getTransaction;
    f.client.getTransaction = async () => ({
      ...(await original({ hash: paymentHash }))!,
      to: recipientA,
    });
    await expect(
      verifyPaymentEvidence(f.client, f.deployment, paymentHash),
    ).rejects.toThrow("target");
    f.client.getTransaction = async () => ({
      ...(await original({ hash: paymentHash }))!,
      from: recipientA,
    });
    await expect(
      verifyPaymentEvidence(f.client, f.deployment, paymentHash),
    ).rejects.toThrow("payer");
    f.client.getTransaction = async () => ({
      ...(await original({ hash: paymentHash }))!,
      input: "0x12345678",
    });
    await expect(
      verifyPaymentEvidence(f.client, f.deployment, paymentHash),
    ).rejects.toThrow("calldata");
  });

  it("rejects absent InvoicePaid evidence and logs emitted by the wrong address", async () => {
    const f = fixture();
    f.setReceipt({
      transactionHash: paymentHash,
      blockNumber,
      status: "success",
      logs: [f.log(USDC, f.transferA), f.log(USDC, f.transferB)],
    });
    await expect(
      verifyPaymentEvidence(f.client, f.deployment, paymentHash),
    ).rejects.toThrow("exactly one InvoicePaid");
    f.setReceipt({
      transactionHash: paymentHash,
      blockNumber,
      status: "success",
      logs: [
        f.log(USDC, f.paidLog),
        f.log(USDC, f.transferA),
        f.log(USDC, f.transferB),
      ],
    });
    await expect(
      verifyPaymentEvidence(f.client, f.deployment, paymentHash),
    ).rejects.toThrow("exactly one InvoicePaid");
  });

  it("rejects invalid token/runtime metadata, missing transactions, and RPC failure", async () => {
    const f = fixture();
    await expect(
      verifyPaymentEvidence(
        f.client,
        { ...f.deployment, usdcAddress: recipientA },
        paymentHash,
      ),
    ).rejects.toThrow("Deployment metadata");
    await expect(
      verifyPaymentEvidence(
        f.client,
        { ...f.deployment, runtimeCodeHash: `0x${"99".repeat(32)}` as Hash },
        paymentHash,
      ),
    ).rejects.toThrow("runtime code");
    f.client.getTransaction = async () => null;
    await expect(
      verifyPaymentEvidence(f.client, f.deployment, paymentHash),
    ).rejects.toThrow("not found");
    f.client.getTransaction = async () => {
      throw new Error("RPC unavailable");
    };
    await expect(
      verifyPaymentEvidence(f.client, f.deployment, paymentHash),
    ).rejects.toThrow("RPC unavailable");
  });
});
