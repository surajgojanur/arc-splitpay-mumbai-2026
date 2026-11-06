import {
  decodeEventLog,
  erc20Abi,
  getAddress,
  isAddress,
  keccak256,
  zeroHash,
  type Abi,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { abis } from "./contracts/profiles";
import { parseDeployment, type Deployment } from "./deployment";
import { split, type Draft, fromDraft } from "./invoice";
import { USDC } from "./network";
export type Call = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
};
export type Log = {
  address: Address;
  data: Hex;
  topics: readonly [Hex, ...Hex[]];
  transactionHash: Hash;
  blockNumber: bigint;
  logIndex: number;
};
export type Receipt = {
  status: "success" | "reverted";
  transactionHash: Hash;
  blockNumber: bigint;
  contractAddress?: Address | null;
  logs: Log[];
};
export interface Gateway {
  chainId(): Promise<number>;
  walletChainId(): Promise<number>;
  account(): Promise<Address | undefined>;
  code(address: Address): Promise<Hex | undefined>;
  read(call: Call): Promise<unknown>;
  simulate(call: Call, account: Address): Promise<void>;
  send(call: Call, account: Address): Promise<Hash>;
  confirm(hash: Hash): Promise<Receipt>;
  receipt(hash: Hash): Promise<Receipt>;
  block(number?: bigint): Promise<{ number: bigint; timestamp: bigint }>;
  logs(
    address: Address,
    abi: Abi,
    event: string,
    id: bigint,
    from: bigint,
    to: bigint,
  ): Promise<Log[]>;
}
export type TxState = {
  phase: "wallet" | "pending" | "confirmed" | "error";
  hash?: Hash;
  message: string;
};
export type LiveInvoice = {
  id: bigint;
  payer: Address;
  creator: Address;
  recipientA: Address;
  recipientB: Address;
  amount: bigint;
  shareBps: number;
  expiry: bigint;
  status: "open" | "paid" | "cancelled";
  createdAt?: bigint;
  paidAt?: bigint;
};
export type History = {
  events: { event: string; hash: Hash; block: bigint }[];
  partial: boolean;
  error?: string;
  payment?: { hash: Hash; timestamp: bigint; payoutA: bigint; payoutB: bigint };
};
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const address = (v: unknown): Address => {
  if (typeof v !== "string" || !isAddress(v))
    throw new Error("Invalid invoice address returned by contract.");
  return getAddress(v);
};
const integer = (v: unknown) => {
  if (typeof v !== "bigint" && typeof v !== "number")
    throw new Error("Invalid integer returned by contract.");
  return BigInt(v);
};
export function friendlyError(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as {
      code?: number;
      name?: string;
      cause?: unknown;
      shortMessage?: string;
      message?: string;
      data?: { errorName?: string };
    };
    if (e.code === 4001 || e.name === "UserRejectedRequestError")
      return "Wallet request rejected. No new transaction was submitted.";
    const names: Record<string, string> = {
      NotPayer: "Only the designated payer can pay this invoice.",
      NotAuthorized: "Only the creator or payer can cancel.",
      InvoiceExpired: "This invoice has expired.",
      InvoiceNotOpen: "Invoice is already paid or cancelled.",
      InvoiceNotFound: "Invoice not found.",
      InsufficientAllowance: "Approve the required USDC amount first.",
      ERC20InsufficientAllowance: "Approve the required USDC amount first.",
      ERC20InsufficientBalance: "Insufficient USDC balance.",
      ZeroPayout: "Amount is too small for both payouts.",
      SafeERC20FailedOperation: "USDC transfer failed. Settlement reverted.",
    };
    if (e.data?.errorName && names[e.data.errorName])
      return names[e.data.errorName];
    if (e.cause) return friendlyError(e.cause);
    return (
      e.shortMessage ||
      e.message ||
      "Transaction failed. Refresh chain state before retrying."
    ).slice(0, 500);
  }
  return "Transaction failed. Refresh chain state before retrying.";
}
export class LiveInvoiceService {
  readonly deployment: Deployment;
  readonly abi: Abi;
  private busy = false;
  private unresolvedHash?: Hash;
  private submittedHash?: Hash;
  get pendingHash() {
    return this.unresolvedHash;
  }
  async recoverPending() {
    if (!this.unresolvedHash) throw new Error("No unresolved transaction.");
    const hash = this.unresolvedHash;
    const receipt = await this.gateway.receipt(hash);
    if (receipt.transactionHash !== hash)
      throw new Error("Receipt hash mismatch.");
    this.unresolvedHash = undefined;
    this.notify({
      phase: receipt.status === "success" ? "confirmed" : "error",
      hash,
      message:
        receipt.status === "success"
          ? "Submitted transaction confirmed. Refresh the invoice before any further action."
          : "Submitted transaction reverted. No payout occurred.",
    });
    return receipt;
  }
  constructor(
    readonly gateway: Gateway,
    config: unknown,
    readonly notify: (s: TxState) => void = () => {},
  ) {
    this.deployment = parseDeployment(config);
    this.abi = abis[this.deployment.profile];
  }
  private call(functionName: string, args: readonly unknown[] = []): Call {
    return {
      address: this.deployment.contractAddress,
      abi: this.abi,
      functionName,
      args,
    };
  }
  async verify() {
    const d = this.deployment;
    if ((await this.gateway.chainId()) !== d.chainId)
      throw new Error("RPC network mismatch.");
    const [code, token, decimals, receipt] = await Promise.all([
      this.gateway.code(d.contractAddress),
      this.gateway.read(this.call("usdc")),
      this.gateway.read({
        address: USDC,
        abi: erc20Abi,
        functionName: "decimals",
      }),
      this.gateway.receipt(d.deploymentTransactionHash),
    ]);
    if (!code || code === "0x" || keccak256(code) !== d.runtimeCodeHash)
      throw new Error("Contract bytecode does not match reviewed deployment.");
    if (
      typeof token !== "string" ||
      !same(token, USDC) ||
      integer(decimals) !== 6n
    )
      throw new Error("Contract must use official 6-decimal Arc USDC.");
    if (
      receipt.status !== "success" ||
      receipt.transactionHash !== d.deploymentTransactionHash ||
      receipt.blockNumber !== d.deploymentBlock ||
      !receipt.contractAddress ||
      !same(receipt.contractAddress, d.contractAddress)
    )
      throw new Error(
        "Deployment receipt does not match the configured direct deployment.",
      );
  }
  async wallet(expected: Address) {
    if ((await this.gateway.walletChainId()) !== this.deployment.chainId)
      throw new Error("Wallet network mismatch. Switch to Arc Testnet.");
    const actual = await this.gateway.account();
    if (!actual || !same(actual, expected))
      throw new Error("Wallet account changed. Connect again before signing.");
  }
  async getInvoice(id: bigint): Promise<LiveInvoice> {
    if (id <= 0n) throw new Error("Enter a positive invoice ID.");
    const raw = await this.gateway.read(this.call("getInvoice", [id]));
    let i: LiveInvoice;
    let status: bigint;
    if (this.deployment.profile === "studio-v1") {
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new Error("Studio invoice ABI mismatch.");
      const r = raw as Record<string, unknown>;
      status = integer(r.status);
      i = {
        id,
        creator: address(r.creator),
        payer: address(r.payer),
        recipientA: address(r.recipientA),
        recipientB: address(r.recipientB),
        amount: integer(r.amount),
        shareBps: Number(integer(r.bpsA)),
        expiry: integer(r.expiry),
        createdAt: integer(r.createdAt),
        paidAt: integer(r.paidAt),
        status: "open",
      };
      if (integer(r.bpsB) + BigInt(i.shareBps) !== 10000n)
        throw new Error("Invalid invoice basis points.");
    } else {
      if (!Array.isArray(raw) || raw.length !== 7)
        throw new Error("Kishore invoice ABI mismatch.");
      status = integer(raw[6]);
      if (status === 0n) throw new Error("Invoice not found.");
      i = {
        id,
        payer: address(raw[0]),
        creator: address(raw[0]),
        recipientA: address(raw[1]),
        recipientB: address(raw[2]),
        amount: integer(raw[3]),
        shareBps: Number(integer(raw[4])),
        expiry: integer(raw[5]),
        status: "open",
      };
    }
    if (
      status < 1n ||
      status > 3n ||
      i.amount <= 0n ||
      i.shareBps < 1 ||
      i.shareBps > 9999
    )
      throw new Error("Invalid or missing invoice state.");
    i.status = status === 1n ? "open" : status === 2n ? "paid" : "cancelled";
    return i;
  }
  async funding(payer: Address) {
    const [b, a] = await Promise.all([
      this.gateway.read({
        address: USDC,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [payer],
      }),
      this.gateway.read({
        address: USDC,
        abi: erc20Abi,
        functionName: "allowance",
        args: [payer, this.deployment.contractAddress],
      }),
    ]);
    return { balance: integer(b), allowance: integer(a) };
  }
  private async open(id: bigint, caller: Address, pay: boolean) {
    const [i, b] = await Promise.all([
      this.getInvoice(id),
      this.gateway.block(),
    ]);
    if (i.status !== "open") throw new Error(`Invoice already ${i.status}.`);
    if (pay && !same(i.payer, caller))
      throw new Error("Only the designated payer can pay this invoice.");
    if (
      !pay &&
      !same(i.payer, caller) &&
      !(this.deployment.profile === "studio-v1" && same(i.creator, caller))
    )
      throw new Error("Only an authorized wallet can cancel.");
    if (
      pay &&
      (this.deployment.profile === "studio-v1"
        ? b.timestamp > i.expiry
        : b.timestamp >= i.expiry)
    )
      throw new Error("This invoice has expired.");
    return i;
  }
  private async transaction(call: Call, caller: Address) {
    await this.wallet(caller);
    await this.gateway.simulate(call, caller);
    await this.wallet(caller);
    this.notify({
      phase: "wallet",
      message: "Confirm this transaction in your wallet.",
    });
    const hash = await this.gateway.send(call, caller);
    this.unresolvedHash = hash;
    this.submittedHash = hash;
    this.notify({
      phase: "pending",
      hash,
      message: "Transaction submitted. Waiting for confirmation.",
    });
    const receipt = await this.gateway.confirm(hash);
    if (receipt.transactionHash === hash) this.unresolvedHash = undefined;
    if (receipt.status !== "success" || receipt.transactionHash !== hash)
      throw new Error(
        `Transaction reverted or receipt mismatch. Check ${hash} on the explorer before retrying.`,
      );
    return receipt;
  }
  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    if (this.busy) throw new Error("A wallet operation is already pending.");
    if (this.unresolvedHash)
      throw new Error(
        `A submitted transaction is unresolved. Check ${this.unresolvedHash} before retrying.`,
      );
    this.submittedHash = undefined;
    this.busy = true;
    try {
      await this.verify();
      return await work();
    } catch (e) {
      this.notify({
        phase: "error",
        hash: this.submittedHash,
        message: this.unresolvedHash
          ? "Confirmation unavailable. Check the submitted transaction before retrying. " +
            friendlyError(e)
          : friendlyError(e),
      });
      throw e;
    } finally {
      this.busy = false;
    }
  }
  events(receipt: Receipt, eventName: string, id?: bigint) {
    return receipt.logs.flatMap((log) => {
      if (!same(log.address, this.deployment.contractAddress)) return [];
      try {
        const decoded = decodeEventLog({
          abi: this.abi,
          data: log.data,
          topics: [...log.topics],
        });
        if (decoded.eventName !== eventName) return [];
        const args = decoded.args as unknown as Record<string, unknown>;
        if (id !== undefined && args.id !== id) return [];
        return [args];
      } catch {
        return [];
      }
    });
  }
  async createInvoice(draft: Draft, caller: Address) {
    return this.guarded(async () => {
      const d = fromDraft(draft);
      const expiry = BigInt(Math.floor(d.expiry / 1000));
      const block = await this.gateway.block();
      if (expiry <= block.timestamp)
        throw new Error("Choose an expiry after the latest chain timestamp.");
      if (this.deployment.profile === "kishore-v1" && !same(d.payer, caller))
        throw new Error(
          "This contract makes the creator the designated payer.",
        );
      if (
        [d.recipientA, d.recipientB, d.payer].some((a) =>
          same(a, this.deployment.contractAddress),
        )
      )
        throw new Error(
          "Use participant wallets, not the invoice contract address.",
        );
      if (this.deployment.profile === "studio-v1" && d.amount > 2n ** 128n - 1n)
        throw new Error("Studio invoice amount exceeds uint128.");
      const args =
        this.deployment.profile === "studio-v1"
          ? [
              d.payer,
              d.recipientA,
              d.recipientB,
              d.amount,
              d.shareBps,
              10000 - d.shareBps,
              expiry,
              zeroHash,
            ]
          : [d.recipientA, d.recipientB, d.amount, d.shareBps, expiry];
      const receipt = await this.transaction(
        this.call("createInvoice", args),
        caller,
      );
      const event = this.events(receipt, "InvoiceCreated").find(
        (e) =>
          same(String(e.payer), d.payer) &&
          e.amount === d.amount &&
          same(String(e.recipientA), d.recipientA) &&
          same(String(e.recipientB), d.recipientB),
      );
      if (!event || typeof event.id !== "bigint")
        throw new Error(
          "Transaction confirmed but expected InvoiceCreated event missing. Inspect explorer before retrying.",
        );
      this.notify({
        phase: "confirmed",
        hash: receipt.transactionHash,
        message: "Invoice created on Arc Testnet.",
      });
      return this.getInvoice(event.id);
    });
  }
  async approve(id: bigint, caller: Address) {
    return this.guarded(async () => {
      const i = await this.open(id, caller, true);
      const { balance } = await this.funding(caller);
      if (balance < i.amount)
        throw new Error("Insufficient USDC balance. Leave extra USDC for gas.");
      const receipt = await this.transaction(
        {
          address: USDC,
          abi: erc20Abi,
          functionName: "approve",
          args: [this.deployment.contractAddress, i.amount],
        },
        caller,
      );
      const { allowance } = await this.funding(caller);
      if (allowance < i.amount)
        throw new Error(
          "Approval confirmed but allowance is insufficient. Refresh before retrying.",
        );
      this.notify({
        phase: "confirmed",
        hash: receipt.transactionHash,
        message: "Exact invoice amount approved.",
      });
      return receipt;
    });
  }
  async payInvoice(id: bigint, caller: Address) {
    return this.guarded(async () => {
      const i = await this.open(id, caller, true);
      const f = await this.funding(caller);
      if (f.balance < i.amount)
        throw new Error("Insufficient USDC balance. Leave extra USDC for gas.");
      if (f.allowance < i.amount)
        throw new Error(
          "Insufficient allowance. Approve the exact invoice amount first.",
        );
      const receipt = await this.transaction(
        this.call(
          this.deployment.profile === "studio-v1"
            ? "settleInvoice"
            : "payInvoice",
          [id],
        ),
        caller,
      );
      this.paymentReceipt(i, receipt);
      const updated = await this.getInvoice(id);
      if (updated.status !== "paid")
        throw new Error(
          "Confirmed transaction but paid state unavailable. Refresh before retrying.",
        );
      this.notify({
        phase: "confirmed",
        hash: receipt.transactionHash,
        message: "USDC split confirmed on Arc Testnet.",
      });
      return updated;
    });
  }
  async cancelInvoice(id: bigint, caller: Address) {
    return this.guarded(async () => {
      await this.open(id, caller, false);
      const receipt = await this.transaction(
        this.call("cancelInvoice", [id]),
        caller,
      );
      if (!this.events(receipt, "InvoiceCancelled", id).length)
        throw new Error(
          "Cancellation event missing. Inspect the confirmed transaction.",
        );
      this.notify({
        phase: "confirmed",
        hash: receipt.transactionHash,
        message: "Invoice cancellation confirmed.",
      });
      return this.getInvoice(id);
    });
  }
  paymentReceipt(i: LiveInvoice, receipt: Receipt) {
    if (receipt.status !== "success")
      throw new Error("Payment receipt reverted.");
    const [a, b] = split(i.amount, i.shareBps);
    const paid = this.events(receipt, "InvoicePaid", i.id).find(
      (e) =>
        e.amount === i.amount &&
        e.payoutA === a &&
        e.payoutB === b &&
        same(String(e.payer), i.payer),
    );
    if (!paid)
      throw new Error("Expected InvoicePaid event missing from receipt.");
    const transfers = receipt.logs.flatMap((l) => {
      if (!same(l.address, USDC)) return [];
      try {
        const e = decodeEventLog({
          abi: erc20Abi,
          eventName: "Transfer",
          data: l.data,
          topics: [...l.topics],
        });
        return [e.args];
      } catch {
        return [];
      }
    });
    if (
      !transfers.some(
        (t) =>
          same(t.from, i.payer) && same(t.to, i.recipientA) && t.value === a,
      ) ||
      !transfers.some(
        (t) =>
          same(t.from, i.payer) && same(t.to, i.recipientB) && t.value === b,
      )
    )
      throw new Error("Receipt does not prove both expected USDC transfers.");
    return { hash: receipt.transactionHash, payoutA: a, payoutB: b };
  }
  async history(i: LiveInvoice): Promise<History> {
    const result: History = { events: [], partial: false };
    try {
      const head = await this.gateway.block();
      const start =
        head.number > 20000n &&
        this.deployment.deploymentBlock < head.number - 20000n
          ? head.number - 20000n
          : this.deployment.deploymentBlock;
      result.partial = start > this.deployment.deploymentBlock;
      for (let from = start; from <= head.number; from += 2000n) {
        const to = from + 1999n > head.number ? head.number : from + 1999n;
        const batches = await Promise.all(
          ["InvoiceCreated", "InvoicePaid", "InvoiceCancelled"].map(
            async (event) =>
              (
                await this.gateway.logs(
                  this.deployment.contractAddress,
                  this.abi,
                  event,
                  i.id,
                  from,
                  to,
                )
              ).map((log) => ({ event, log })),
          ),
        );
        for (const { event, log } of batches.flat()) {
          if (log.blockNumber < from || log.blockNumber > to) continue;
          const receipt = await this.gateway.receipt(log.transactionHash);
          if (
            !this.events(receipt, event, i.id).length ||
            receipt.status !== "success"
          )
            continue;
          result.events.push({
            event,
            hash: log.transactionHash,
            block: log.blockNumber,
          });
          if (event === "InvoicePaid") {
            const proof = this.paymentReceipt(i, receipt);
            const b = await this.gateway.block(receipt.blockNumber);
            result.payment = { ...proof, timestamp: b.timestamp };
          }
        }
      }
      result.events.sort((a, b) =>
        a.block < b.block ? -1 : a.block > b.block ? 1 : 0,
      );
    } catch (e) {
      result.error = friendlyError(e);
      result.partial = true;
    }
    return result;
  }
}
