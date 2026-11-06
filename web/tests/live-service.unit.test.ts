import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  encodeAbiParameters,
  encodeFunctionData,
  getAbiItem,
  getEventSelector,
  keccak256,
  type AbiEvent,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { abis, abiHash, type Profile } from "../lib/contracts/profiles";
import { parseDeployment } from "../lib/deployment";
import {
  LiveInvoiceService,
  friendlyError,
  type Gateway,
  type Call,
  type Log,
  type Receipt,
  type TxState,
} from "../lib/live-service";
import { USDC } from "../lib/network";
import { recoveryStorageKey, type RecoveryStore } from "../lib/tx-recovery";
import {
  prepareDeploymentMetadata,
  verifyArcDeployment,
} from "../scripts/prepare-deployment.mjs";
import {
  FIXTURE_PAYER as payer,
  FIXTURE_A as a,
  FIXTURE_B as b,
} from "../lib/fixture-adapter";
const contract = "0x4444444444444444444444444444444444444444" as Address;
const deployHash = `0x${"aa".repeat(32)}` as Hash;
const txHash = `0x${"bb".repeat(32)}` as Hash;
const code = "0x60006000" as Hex;
class MemoryRecoveryStore implements RecoveryStore {
  values = new Map<string, string>();
  failRead = false;
  failWrite = false;
  failRemove = false;
  read(key: string) {
    if (this.failRead) throw new Error("storage disabled");
    return this.values.get(key) ?? null;
  }
  write(key: string, value: string) {
    if (this.failWrite) throw new Error("storage disabled");
    this.values.set(key, value);
  }
  remove(key: string) {
    if (this.failRemove) throw new Error("storage disabled");
    this.values.delete(key);
  }
}
function config(profile: Profile = "studio-v1") {
  return {
    profile,
    chainId: 5042002,
    contractAddress: contract,
    usdcAddress: USDC,
    usdcDecimals: 6,
    deploymentBlock: "10",
    deploymentTransactionHash: deployHash,
    runtimeCodeHash: keccak256(code),
    abiHash: abiHash(profile),
    explorerUrl: "https://explorer.testnet.arc.io",
  };
}
function log(
  profile: Profile,
  eventName: string,
  args: Record<string, unknown>,
  token = false,
): Log {
  const event = getAbiItem({
    abi: token
      ? [
          {
            type: "event",
            name: "Transfer",
            inputs: [
              { name: "from", type: "address", indexed: true },
              { name: "to", type: "address", indexed: true },
              { name: "value", type: "uint256", indexed: false },
            ],
          },
          {
            type: "event",
            name: "Approval",
            inputs: [
              { name: "owner", type: "address", indexed: true },
              { name: "spender", type: "address", indexed: true },
              { name: "value", type: "uint256", indexed: false },
            ],
          },
        ]
      : abis[profile],
    name: eventName,
  }) as AbiEvent;
  const indexed = event.inputs.filter((p) => p.indexed);
  const other = event.inputs.filter((p) => !p.indexed);
  return {
    address: token ? USDC : contract,
    data: encodeAbiParameters(
      other,
      other.map((p) => args[p.name!]),
    ),
    topics: [
      getEventSelector(event),
      ...indexed.map((p) => encodeAbiParameters([p], [args[p.name!]])),
    ],
    transactionHash: txHash,
    blockNumber: 11n,
    logIndex: 0,
  };
}
class FakeGateway implements Gateway {
  profile: Profile;
  status = 1;
  balance = 1000000000n;
  allowance = 0n;
  now = 1000n;
  expiry = 2000n;
  walletId = 5042002;
  rpcId = 5042002;
  selected: Address = payer;
  lastAccount: Address = payer;
  creator: Address = a;
  runtime: Hex = code;
  token: Address = USDC;
  decimals = 6;
  sent: Call[] = [];
  last?: Call;
  reject = false;
  fail = false;
  timeout = false;
  omitTransfers = false;
  wrongEventAddress = false;
  createEventOverrides: Record<string, unknown> = {};
  simulateError = false;
  constructor(profile: Profile = "studio-v1") {
    this.profile = profile;
  }
  async chainId() {
    return this.rpcId;
  }
  async walletChainId() {
    return this.walletId;
  }
  async account() {
    return this.selected;
  }
  async code() {
    return this.runtime;
  }
  async read(call: Call): Promise<unknown> {
    switch (call.functionName) {
      case "usdc":
        return this.token;
      case "decimals":
        return this.decimals;
      case "balanceOf":
        return this.balance;
      case "allowance":
        return this.allowance;
      case "getInvoice":
        return this.profile === "studio-v1"
          ? {
              creator: this.creator,
              payer,
              recipientA: a,
              recipientB: b,
              amount: 100000000n,
              bpsA: 7000,
              bpsB: 3000,
              expiry: this.expiry,
              createdAt: 900n,
              paidAt: this.status === 2 ? this.now : 0n,
              status: this.status,
              referenceHash: `0x${"00".repeat(32)}`,
            }
          : [payer, a, b, 100000000n, 7000, this.expiry, this.status];
      default:
        throw new Error(call.functionName);
    }
  }
  async simulate() {
    if (this.simulateError) throw new Error("simulation reverted");
  }
  async send(call: Call, account: Address) {
    if (this.reject)
      throw Object.assign(new Error("User rejected"), { code: 4001 });
    this.sent.push(call);
    this.last = call;
    this.lastAccount = account;
    return txHash;
  }
  async transaction(hash: Hash) {
    if (!this.last || hash !== txHash) return null;
    return {
      hash,
      from: this.lastAccount,
      to: this.last.address,
      input: encodeFunctionData({
        abi: this.last.abi,
        functionName: this.last.functionName,
        args: this.last.args,
      }),
    };
  }
  applyEffect() {
    if (this.fail) return;
    if (this.last?.functionName === "approve") this.allowance = 100000000n;
    if (["settleInvoice", "payInvoice"].includes(this.last?.functionName || ""))
      this.status = 2;
    if (this.last?.functionName === "cancelInvoice") this.status = 3;
  }
  async confirm() {
    if (this.timeout) throw new Error("Confirmation timeout");
    this.applyEffect();
    return this.receipt(txHash);
  }
  async receipt(hash: Hash): Promise<Receipt> {
    if (hash === deployHash)
      return {
        status: "success",
        transactionHash: deployHash,
        blockNumber: 10n,
        contractAddress: contract,
        logs: [],
      };
    this.applyEffect();
    return {
      status: this.fail ? "reverted" : "success",
      transactionHash: txHash,
      blockNumber: 11n,
      logs: this.transactionLogs(),
    };
  }
  transactionLogs() {
    if (this.last?.functionName === "approve")
      return [
        log(
          this.profile,
          "Approval",
          {
            owner: this.lastAccount,
            spender: contract,
            value: this.last.args?.[1] ?? 100000000n,
          },
          true,
        ),
      ];
    const event =
      this.last?.functionName === "createInvoice"
        ? "InvoiceCreated"
        : this.last?.functionName === "cancelInvoice"
          ? "InvoiceCancelled"
          : this.profile === "studio-v1"
            ? "InvoicePaid"
            : "InvoicePaid";
    const createArgs =
      this.last?.functionName === "createInvoice" ? (this.last.args ?? []) : [];
    const args = {
      id: 1n,
      creator: payer,
      payer,
      recipientA: a,
      recipientB: b,
      amount: 100000000n,
      bpsA: 7000,
      bpsB: 3000,
      shareBps: 7000,
      expiry: 2000n,
      referenceHash: `0x${"00".repeat(32)}`,
      payoutA: 70000000n,
      payoutB: 30000000n,
      cancelledBy: this.lastAccount,
      ...(this.last?.functionName === "createInvoice"
        ? this.profile === "studio-v1"
          ? {
              creator: createArgs.length ? this.lastAccount : payer,
              payer: createArgs[0],
              recipientA: createArgs[1],
              recipientB: createArgs[2],
              amount: createArgs[3],
              bpsA: createArgs[4],
              bpsB: createArgs[5],
              expiry: createArgs[6],
              referenceHash: createArgs[7],
            }
          : {
              payer: this.lastAccount,
              recipientA: createArgs[0],
              recipientB: createArgs[1],
              amount: createArgs[2],
              shareBps: createArgs[3],
              expiry: createArgs[4],
            }
        : {}),
      ...this.createEventOverrides,
    };
    const e = log(this.profile, event, args);
    if (this.wrongEventAddress) e.address = a;
    if (event !== "InvoicePaid") return [e];
    return [
      e,
      ...(this.omitTransfers
        ? []
        : [
            log(
              this.profile,
              "Transfer",
              { from: payer, to: a, value: 70000000n },
              true,
            ),
            log(
              this.profile,
              "Transfer",
              { from: payer, to: b, value: 30000000n },
              true,
            ),
          ]),
    ];
  }
  async block(number?: bigint) {
    return { number: number ?? 11n, timestamp: this.now };
  }
  async logs(_address: Address, _abi: unknown, event: string) {
    return this.status === 2 && event === "InvoicePaid"
      ? this.transactionLogs().filter((l) => l.address === contract)
      : [];
  }
}
const draft = {
  payer,
  recipientA: a,
  recipientB: b,
  amount: "100",
  percent: "70",
  expiry: new Date(Date.now() + 86400000).toISOString(),
};
describe("ABI and deployment gates", () => {
  it("uses exact exported ABIs and distinct signatures", () => {
    const studio = JSON.parse(
      readFileSync(
        new URL(
          "../../docs/studio-original/docs/handoff/ArcSplit.abi.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(abis["studio-v1"]).toEqual(studio);
    const kishore = JSON.parse(
      readFileSync(
        new URL("../../chain/abi/ArcSplit.json", import.meta.url),
        "utf8",
      ),
    );
    expect(abis["kishore-v1"]).toEqual(kishore);
    expect(
      getAbiItem({ abi: abis["studio-v1"], name: "settleInvoice" }),
    ).toBeTruthy();
    expect(
      getAbiItem({ abi: abis["kishore-v1"], name: "payInvoice" }),
    ).toBeTruthy();
    expect(abiHash("studio-v1")).not.toBe(abiHash("kishore-v1"));
  });
  it("rejects malformed or zero deployment metadata before config can be written", () => {
    const metadata = {
      chainId: 5042002,
      contractAddress: contract,
      usdcAddress: USDC,
      usdcDecimals: 6,
      deploymentBlock: "12",
      deploymentTransactionHash: deployHash,
      compilerVersion: "0.8.28+commit.7893614a",
      sourceCommit: "a".repeat(40),
      explorerUrl: `https://explorer.testnet.arc.io/address/${contract}`,
    };
    const runtimeHash = keccak256(code);
    expect(() =>
      prepareDeploymentMetadata(
        { ...metadata, deploymentBlock: Number.MAX_SAFE_INTEGER + 1 },
        "kishore-v1",
        runtimeHash,
      ),
    ).toThrow("metadata");
    expect(() =>
      prepareDeploymentMetadata(metadata, "auto", runtimeHash),
    ).toThrow("profile");
    expect(() =>
      prepareDeploymentMetadata(
        { ...metadata, contractAddress: USDC },
        "kishore-v1",
        runtimeHash,
      ),
    ).toThrow("metadata");
    expect(() =>
      prepareDeploymentMetadata(
        { ...metadata, deploymentTransactionHash: `0x${"0".repeat(64)}` },
        "kishore-v1",
        runtimeHash,
      ),
    ).toThrow("metadata");
    expect(() =>
      prepareDeploymentMetadata(metadata, "kishore-v1", `0x${"0".repeat(64)}`),
    ).toThrow("runtime code hash");
  });
  it("prepares config only after read-only receipt, runtime, token and chain verification", async () => {
    const metadata = {
      chainId: 5042002,
      contractAddress: contract,
      usdcAddress: USDC,
      usdcDecimals: 6,
      deploymentBlock: "12",
      deploymentTransactionHash: deployHash,
      compilerVersion: "0.8.28+commit.7893614a",
      sourceCommit: "a".repeat(40),
      explorerUrl: `https://explorer.testnet.arc.io/address/${contract}`,
    };
    const prepared = prepareDeploymentMetadata(
      metadata,
      "kishore-v1",
      keccak256(code),
    );
    const fake = {
      getChainId: async () => 5042002,
      getTransactionReceipt: async () => ({
        status: "success",
        transactionHash: deployHash,
        blockNumber: 12n,
        contractAddress: contract,
      }),
      getCode: async () => code,
      readContract: async ({
        address,
        functionName,
      }: {
        address: Address;
        functionName: string;
      }) => (functionName === "usdc" ? USDC : address === USDC ? 6 : 0),
    };
    await expect(
      verifyArcDeployment(prepared, fake as never),
    ).resolves.toBeUndefined();
    await expect(
      verifyArcDeployment(prepared, {
        ...fake,
        getTransactionReceipt: async () => ({
          ...(await fake.getTransactionReceipt()),
          transactionHash: `0x${"99".repeat(32)}`,
        }),
      } as never),
    ).rejects.toThrow("receipt");
    await expect(
      verifyArcDeployment(prepared, {
        ...fake,
        getChainId: async () => 1,
      } as never),
    ).rejects.toThrow("network");
    await expect(
      verifyArcDeployment(prepared, {
        ...fake,
        getCode: async () => "0x" as Hex,
      } as never),
    ).rejects.toThrow("bytecode");
    await expect(
      verifyArcDeployment(prepared, {
        ...fake,
        getTransactionReceipt: async () => ({
          status: "reverted",
          blockNumber: 12n,
          contractAddress: contract,
        }),
      } as never),
    ).rejects.toThrow("receipt");
    await expect(
      verifyArcDeployment(prepared, {
        ...fake,
        readContract: async ({
          functionName,
        }: {
          address: Address;
          functionName: string;
        }) => (functionName === "usdc" ? a : 6),
      } as never),
    ).rejects.toThrow("official 6-decimal");
    await expect(
      verifyArcDeployment(prepared, {
        ...fake,
        readContract: async ({
          address,
          functionName,
        }: {
          address: Address;
          functionName: string;
        }) => (functionName === "usdc" ? USDC : address === USDC ? 18 : 0),
      } as never),
    ).rejects.toThrow("official 6-decimal");
  });
  it("rejects missing configuration before any RPC or signature", () =>
    expect(() => parseDeployment(null)).toThrow("Contract not deployed"));
  it.each([
    { chainId: 1 },
    { usdcDecimals: 18 },
    { contractAddress: "0x0" },
    { profile: "auto" },
    { abiHash: deployHash },
    { deploymentBlock: 1.2 },
    { runtimeCodeHash: "0x" },
  ])("rejects invalid config %o", (patch) =>
    expect(() => parseDeployment({ ...config(), ...patch })).toThrow(),
  );
  it.each(["rpc", "code", "token", "decimals", "receipt"])(
    "validates deployed %s",
    async (kind) => {
      const g = new FakeGateway();
      if (kind === "rpc") g.rpcId = 1;
      if (kind === "code") g.runtime = "0x";
      if (kind === "token") g.token = a;
      if (kind === "decimals") g.decimals = 18;
      if (kind === "receipt")
        vi.spyOn(g, "receipt").mockResolvedValue({
          status: "reverted",
          transactionHash: deployHash,
          blockNumber: 10n,
          logs: [],
        });
      await expect(
        new LiveInvoiceService(g, config()).verify(),
      ).rejects.toThrow();
      expect(g.sent).toHaveLength(0);
    },
  );
});
describe.each(["studio-v1", "kishore-v1"] as const)(
  "%s live adapter",
  (profile) => {
    const calldataMismatches: Array<{
      index: number;
      value: unknown;
      label: string;
    }> =
      profile === "studio-v1"
        ? [
            { index: 0, value: b, label: "payer" },
            { index: 1, value: b, label: "recipient A" },
            { index: 2, value: a, label: "recipient B" },
            { index: 3, value: 99999999n, label: "amount" },
            { index: 4, value: 6999, label: "share A" },
            { index: 5, value: 3001, label: "share B" },
            { index: 6, value: 1999n, label: "expiry" },
            {
              index: 7,
              value: `0x${"11".repeat(32)}`,
              label: "reference hash",
            },
          ]
        : [
            { index: 0, value: b, label: "recipient A" },
            { index: 1, value: a, label: "recipient B" },
            { index: 2, value: 99999999n, label: "amount" },
            { index: 3, value: 6999, label: "share" },
            { index: 4, value: 1999n, label: "expiry" },
          ];
    const eventMismatches: Array<Record<string, unknown>> =
      profile === "studio-v1"
        ? [
            { payer: b },
            { creator: b },
            { recipientA: b },
            { recipientB: a },
            { amount: 99999999n },
            { bpsA: 6999 },
            { bpsB: 2999 },
            { expiry: 1999n },
            { referenceHash: `0x${"11".repeat(32)}` },
          ]
        : [
            { payer: b },
            { recipientA: b },
            { recipientB: a },
            { amount: 99999999n },
            { shareBps: 6999 },
            { expiry: 1999n },
          ];
    function setup() {
      const g = new FakeGateway(profile);
      const states: TxState[] = [];
      return {
        g,
        states,
        s: new LiveInvoiceService(g, config(profile), (x) => states.push(x)),
      };
    }
    it.each(calldataMismatches)(
      "fails closed when recovered create calldata changes $label",
      async ({ index, value }) => {
        const { g } = setup();
        const store = new MemoryRecoveryStore();
        const s = new LiveInvoiceService(g, config(profile), () => {});
        await s.initializeRecovery(store);
        g.timeout = true;
        await expect(s.createInvoice(draft, payer)).rejects.toThrow("timeout");
        const call = g.last!;
        const args = [...(call.args ?? [])];
        args[index] = value;
        g.last = { ...call, args };
        const restored = new LiveInvoiceService(
          g,
          config(profile),
          () => {},
          true,
        );
        await restored.initializeRecovery(store);
        g.timeout = false;
        await expect(restored.recoverPending()).rejects.toThrow(
          "calldata does not match",
        );
        expect(restored.pendingHash).toBe(txHash);
        expect(g.sent).toHaveLength(1);
      },
    );
    it.each(eventMismatches)(
      "does not accept a creation event with mismatched fields %#",
      async (overrides) => {
        const { g } = setup();
        const store = new MemoryRecoveryStore();
        const s = new LiveInvoiceService(g, config(profile), () => {});
        await s.initializeRecovery(store);
        g.timeout = true;
        await expect(s.createInvoice(draft, payer)).rejects.toThrow("timeout");
        g.createEventOverrides = overrides;
        const restored = new LiveInvoiceService(
          g,
          config(profile),
          () => {},
          true,
        );
        await restored.initializeRecovery(store);
        g.timeout = false;
        await expect(restored.recoverPending()).rejects.toThrow(
          "matching invoice creation event",
        );
        expect(restored.pendingHash).toBe(txHash);
      },
    );
    it("normalizes exact invoice model and six-decimal funding", async () => {
      const { s } = setup();
      const i = await s.getInvoice(1n);
      expect(i.amount).toBe(100000000n);
      expect(i.shareBps).toBe(7000);
      expect((await s.funding(payer)).balance).toBe(1000000000n);
    });
    it("creates with exact ABI arguments and decodes ID from receipt", async () => {
      const { g, s } = setup();
      const i = await s.createInvoice(draft, payer);
      expect(i.id).toBe(1n);
      expect(g.sent[0].functionName).toBe("createInvoice");
      expect(g.sent[0].args).toHaveLength(profile === "studio-v1" ? 8 : 5);
      expect(g.sent[0].args?.[profile === "studio-v1" ? 3 : 2]).toBe(
        100000000n,
      );
      expect(g.sent[0].args?.[profile === "studio-v1" ? 6 : 4]).toBe(
        BigInt(Math.floor(Date.parse(draft.expiry) / 1000)),
      );
    });
    it("approves exact amount, then confirms payment with both transfer logs", async () => {
      const { g, s, states } = setup();
      await s.approve(1n, payer);
      expect(g.sent[0].args).toEqual([contract, 100000000n]);
      expect((await s.payInvoice(1n, payer)).status).toBe("paid");
      expect(g.sent[1].functionName).toBe(
        profile === "studio-v1" ? "settleInvoice" : "payInvoice",
      );
      expect(states.map((s) => s.phase)).toContain("pending");
      expect(states.at(-1)?.phase).toBe("confirmed");
      const history = await s.history(await s.getInvoice(1n));
      expect(history.payment?.payoutA).toBe(70000000n);
      await expect(s.payInvoice(1n, payer)).rejects.toThrow("already paid");
    });
    it("requires correct wallet network and account", async () => {
      const { g, s } = setup();
      g.walletId = 1;
      await expect(s.approve(1n, payer)).rejects.toThrow("network mismatch");
      g.walletId = 5042002;
      g.selected = a;
      await expect(s.approve(1n, payer)).rejects.toThrow("account changed");
      expect(g.sent).toHaveLength(0);
    });
    it("handles wallet rejection without a fake transaction hash", async () => {
      const { g, s, states } = setup();
      g.reject = true;
      await expect(s.approve(1n, payer)).rejects.toThrow("rejected");
      expect(states.at(-1)?.message).toContain("rejected");
      expect(states.at(-1)?.hash).toBeUndefined();
      expect(g.sent).toHaveLength(0);
    });
    it("checks insufficient balance and allowance before signing", async () => {
      const { g, s } = setup();
      g.balance = 0n;
      await expect(s.payInvoice(1n, payer)).rejects.toThrow("balance");
      g.balance = 1000000000n;
      await expect(s.payInvoice(1n, payer)).rejects.toThrow("allowance");
      expect(g.sent).toHaveLength(0);
    });
    it("rejects cancelled, duplicate, expired and wrong-payer payments", async () => {
      const { g, s } = setup();
      g.status = 3;
      await expect(s.payInvoice(1n, payer)).rejects.toThrow("cancelled");
      g.status = 2;
      await expect(s.payInvoice(1n, payer)).rejects.toThrow("paid");
      g.status = 1;
      g.now = 2001n;
      await expect(s.payInvoice(1n, payer)).rejects.toThrow("expired");
      g.now = 1000n;
      await expect(s.payInvoice(1n, a)).rejects.toThrow("designated payer");
      expect(g.sent).toHaveLength(0);
    });
    it("uses the correct exact-expiry boundary", async () => {
      const { g, s } = setup();
      g.now = g.expiry;
      g.allowance = 100000000n;
      if (profile === "studio-v1")
        expect((await s.payInvoice(1n, payer)).status).toBe("paid");
      else await expect(s.payInvoice(1n, payer)).rejects.toThrow("expired");
    });
    it("allows expired cancellation with profile-specific authorization", async () => {
      const { g, s } = setup();
      g.now = 3000n;
      g.selected = a;
      if (profile === "studio-v1")
        expect((await s.cancelInvoice(1n, a)).status).toBe("cancelled");
      else await expect(s.cancelInvoice(1n, a)).rejects.toThrow("authorized");
    });
    it("rejects reverted receipt and does not claim success", async () => {
      const { g, s, states } = setup();
      g.fail = true;
      await expect(s.approve(1n, payer)).rejects.toThrow("reverted");
      expect(states.at(-1)?.phase).toBe("error");
      expect(states.at(-1)?.hash).toBe(txHash);
    });
    it("restores a timeout after service recreation and recovers read-only", async () => {
      const { g, states } = setup();
      const store = new MemoryRecoveryStore();
      const s = new LiveInvoiceService(g, config(profile), (x) =>
        states.push(x),
      );
      await s.initializeRecovery(store);
      g.timeout = true;
      await expect(s.approve(1n, payer)).rejects.toThrow("timeout");
      expect(s.pendingHash).toBe(txHash);
      expect(states.at(-1)?.hash).toBe(txHash);
      await expect(s.approve(1n, payer)).rejects.toThrow("unresolved");
      expect(g.sent).toHaveLength(1);
      const key = recoveryStorageKey({
        chainId: 5042002,
        contractAddress: contract,
        profile,
      });
      expect(JSON.parse(store.values.get(key)!)).toMatchObject({
        version: 2,
        createIntent: null,
        hash: txHash,
        operation: "approve",
        account: payer,
        invoiceId: "1",
        amount: "100000000",
      });
      const restored = new LiveInvoiceService(
        g,
        config(profile),
        (x) => states.push(x),
        true,
      );
      await restored.initializeRecovery(store);
      expect(restored.pendingHash).toBe(txHash);
      g.timeout = false;
      const recovered = await restored.recoverPending();
      expect(recovered.receipt.transactionHash).toBe(txHash);
      expect(restored.pendingHash).toBeUndefined();
      expect(store.values.has(key)).toBe(false);
      expect(g.sent).toHaveLength(1);
      expect(states.at(-1)?.message).toContain("not payment evidence");
    });
    it("does not accept foreign events or missing USDC transfer proof", async () => {
      const { g, s } = setup();
      g.allowance = 100000000n;
      g.omitTransfers = true;
      await expect(s.payInvoice(1n, payer)).rejects.toThrow(
        "both expected USDC",
      );
      expect(s.pendingHash).toBe(txHash);
      await expect(s.payInvoice(1n, payer)).rejects.toThrow("unresolved");
      await expect(s.recoverPending()).rejects.toThrow("both expected USDC");
      g.status = 1;
      g.omitTransfers = false;
      g.wrongEventAddress = true;
      await expect(s.recoverPending()).rejects.toThrow(
        "InvoicePaid event missing",
      );
    });
    it("stops on simulation revert before wallet signing", async () => {
      const { g, s } = setup();
      g.simulateError = true;
      await expect(s.approve(1n, payer)).rejects.toThrow("simulation");
      expect(g.sent).toHaveLength(0);
    });
    it.each(["create", "pay", "cancel"] as const)(
      "recovers a pending %s operation without resubmitting",
      async (operation) => {
        const { g, states } = setup();
        const store = new MemoryRecoveryStore();
        const s = new LiveInvoiceService(g, config(profile), (x) =>
          states.push(x),
        );
        await s.initializeRecovery(store);
        if (operation === "pay") g.allowance = 100000000n;
        g.timeout = true;
        if (operation === "create")
          await expect(s.createInvoice(draft, payer)).rejects.toThrow(
            "timeout",
          );
        else if (operation === "pay")
          await expect(s.payInvoice(1n, payer)).rejects.toThrow("timeout");
        else
          await expect(s.cancelInvoice(1n, payer)).rejects.toThrow("timeout");
        const restored = new LiveInvoiceService(
          g,
          config(profile),
          () => {},
          true,
        );
        await restored.initializeRecovery(store);
        g.timeout = false;
        const result = await restored.recoverPending();
        expect(result.invoiceId).toBe(1n);
        expect(restored.pendingHash).toBeUndefined();
        expect(g.sent).toHaveLength(1);
      },
    );
  },
);

it("fails closed on corrupted persisted recovery without crashing", async () => {
  const g = new FakeGateway();
  const store = new MemoryRecoveryStore();
  const key = recoveryStorageKey({
    chainId: 5042002,
    contractAddress: contract,
    profile: "studio-v1",
  });
  store.values.set(key, '{"version":99}');
  const service = new LiveInvoiceService(g, config(), () => {}, true);
  await service.initializeRecovery(store);
  expect(service.recoveryIssue).toContain("unsupported shape");
  await expect(service.approve(1n, payer)).rejects.toThrow(
    "Live transactions are blocked",
  );
  expect(g.sent).toHaveLength(0);
});

it("blocks malformed persisted create intents before any transaction can be sent", async () => {
  const g = new FakeGateway();
  const store = new MemoryRecoveryStore();
  const key = recoveryStorageKey({
    chainId: 5042002,
    contractAddress: contract,
    profile: "studio-v1",
  });
  store.values.set(
    key,
    JSON.stringify({
      version: 2,
      chainId: 5042002,
      contractAddress: contract,
      profile: "studio-v1",
      account: payer,
      operation: "create",
      invoiceId: null,
      amount: null,
      hash: txHash,
      createdAt: Date.now(),
      createIntent: {
        payer,
        creator: payer,
        recipientA: a,
        recipientB: b,
        amount: "100000000",
        shareBps: 7000,
        expiry: "not-a-number",
        referenceHash: `0x${"00".repeat(32)}`,
      },
    }),
  );
  const service = new LiveInvoiceService(g, config(), () => {}, true);
  await service.initializeRecovery(store);
  expect(service.recoveryIssue).toContain("creation intent is invalid");
  await expect(service.createInvoice(draft, payer)).rejects.toThrow(
    "Live transactions are blocked",
  );
  expect(g.sent).toHaveLength(0);
});

it("rejects unsupported recovery versions with the expected schema", async () => {
  const g = new FakeGateway();
  const store = new MemoryRecoveryStore();
  const key = recoveryStorageKey({
    chainId: 5042002,
    contractAddress: contract,
    profile: "studio-v1",
  });
  store.values.set(
    key,
    JSON.stringify({
      version: 3,
      chainId: 5042002,
      contractAddress: contract,
      profile: "studio-v1",
      account: payer,
      operation: "pay",
      invoiceId: "1",
      amount: null,
      createIntent: null,
      hash: txHash,
      createdAt: Date.now(),
    }),
  );
  const service = new LiveInvoiceService(g, config(), () => {}, true);
  await service.initializeRecovery(store);
  expect(service.recoveryIssue).toContain("unsupported version");
  await expect(service.payInvoice(1n, payer)).rejects.toThrow(
    "unsupported version",
  );
  expect(g.sent).toHaveLength(0);
});

it("does not attach a saved record to a different ABI profile", async () => {
  const g = new FakeGateway();
  const store = new MemoryRecoveryStore();
  const key = recoveryStorageKey({
    chainId: 5042002,
    contractAddress: contract,
    profile: "studio-v1",
  });
  store.values.set(
    key,
    JSON.stringify({
      version: 2,
      chainId: 5042002,
      contractAddress: contract,
      profile: "kishore-v1",
      account: payer,
      operation: "pay",
      invoiceId: "1",
      amount: null,
      createIntent: null,
      hash: txHash,
      createdAt: Date.now(),
    }),
  );
  const service = new LiveInvoiceService(
    g,
    config("studio-v1"),
    () => {},
    true,
  );
  await service.initializeRecovery(store);
  expect(service.recoveryIssue).toContain(
    "different contract, network, or ABI profile",
  );
  expect(service.pendingHash).toBeUndefined();
  await expect(service.payInvoice(1n, payer)).rejects.toThrow(
    "Live transactions are blocked",
  );
  expect(g.sent).toHaveLength(0);
});

it("retains the recovery lock when the RPC cannot find the submitted transaction", async () => {
  const g = new FakeGateway();
  const store = new MemoryRecoveryStore();
  const service = new LiveInvoiceService(g, config(), () => {});
  await service.initializeRecovery(store);
  g.timeout = true;
  await expect(service.approve(1n, payer)).rejects.toThrow("timeout");
  g.transaction = async () => null;
  await expect(service.recoverPending()).rejects.toThrow(
    "not available from the RPC yet",
  );
  expect(service.pendingHash).toBe(txHash);
  await expect(service.approve(1n, payer)).rejects.toThrow("unresolved");
  expect(g.sent).toHaveLength(1);
});

it("keeps the lock when the recovery RPC is on the wrong network", async () => {
  const g = new FakeGateway();
  const store = new MemoryRecoveryStore();
  const service = new LiveInvoiceService(g, config(), () => {});
  await service.initializeRecovery(store);
  g.timeout = true;
  await expect(service.approve(1n, payer)).rejects.toThrow("timeout");
  g.timeout = false;
  g.rpcId = 1;
  await expect(service.recoverPending()).rejects.toThrow(
    "RPC network mismatch",
  );
  expect(service.pendingHash).toBe(txHash);
  expect(g.sent).toHaveLength(1);
});

it("degrades cleanly when browser storage cannot be read", async () => {
  const g = new FakeGateway();
  const store = new MemoryRecoveryStore();
  store.failRead = true;
  const service = new LiveInvoiceService(g, config(), () => {});
  await expect(service.initializeRecovery(store)).resolves.toBeUndefined();
  expect(service.persistenceWarning).toContain(
    "cannot be recovered after a reload",
  );
  expect(service.recoveryIssue).toBeUndefined();
  expect(service.isRecoveryReady).toBe(true);
});

it("keeps the in-memory lock and warns when browser storage is unavailable", async () => {
  const g = new FakeGateway();
  const store = new MemoryRecoveryStore();
  store.failWrite = true;
  const states: TxState[] = [];
  const service = new LiveInvoiceService(g, config(), (state) =>
    states.push(state),
  );
  await service.initializeRecovery(store);
  g.timeout = true;
  await expect(service.approve(1n, payer)).rejects.toThrow("timeout");
  expect(service.pendingHash).toBe(txHash);
  expect(service.persistenceWarning).toContain("will not survive a reload");
  expect(states.at(-1)?.message).toContain("Browser storage is unavailable");
  expect(g.sent).toHaveLength(1);
});

it("releases a persisted transaction only after a mined revert is verified", async () => {
  const g = new FakeGateway();
  const store = new MemoryRecoveryStore();
  const service = new LiveInvoiceService(g, config(), () => {});
  await service.initializeRecovery(store);
  g.timeout = true;
  await expect(service.approve(1n, payer)).rejects.toThrow("timeout");
  g.fail = true;
  g.timeout = false;
  const outcome = await service.recoverPending();
  expect(outcome.receipt.status).toBe("reverted");
  expect(service.pendingHash).toBeUndefined();
  expect(g.sent).toHaveLength(1);
  await expect(service.approve(1n, payer)).rejects.toThrow("reverted");
  expect(g.sent).toHaveLength(2);
});

it("rejects a transaction whose recovered sender does not match the saved wallet", async () => {
  const g = new FakeGateway();
  const store = new MemoryRecoveryStore();
  const service = new LiveInvoiceService(g, config(), () => {});
  await service.initializeRecovery(store);
  g.timeout = true;
  await expect(service.approve(1n, payer)).rejects.toThrow("timeout");
  g.timeout = false;
  g.lastAccount = a;
  await expect(service.recoverPending()).rejects.toThrow("originating wallet");
  expect(service.pendingHash).toBe(txHash);
  expect(g.sent).toHaveLength(1);
});

it("does not associate a persisted operation with a different wallet", async () => {
  const g = new FakeGateway();
  const store = new MemoryRecoveryStore();
  const service = new LiveInvoiceService(g, config(), () => {});
  await service.initializeRecovery(store);
  g.timeout = true;
  await expect(service.approve(1n, payer)).rejects.toThrow("timeout");
  const restored = new LiveInvoiceService(g, config(), () => {});
  await restored.initializeRecovery(store);
  g.selected = a;
  await expect(restored.approve(1n, a)).rejects.toThrow("unresolved");
  g.timeout = false;
  await expect(restored.recoverPending()).resolves.toBeTruthy();
  expect(g.sent).toHaveLength(1);
});
it("maps decoded custom errors for recovery", () => {
  expect(
    friendlyError({ cause: { data: { errorName: "InvoiceExpired" } } }),
  ).toContain("expired");
  expect(
    friendlyError({ data: { errorName: "ERC20InsufficientAllowance" } }),
  ).toContain("Approve");
});

it("enforces Studio uint128 bound and contract-specific overflow before signing", async () => {
  for (const profile of ["studio-v1", "kishore-v1"] as const) {
    const g = new FakeGateway(profile);
    const service = new LiveInvoiceService(g, config(profile));
    await expect(
      service.createInvoice(
        { ...draft, amount: (2n ** 232n).toString() },
        payer,
      ),
    ).rejects.toThrow(profile === "studio-v1" ? "uint128" : "overflow");
    expect(g.sent).toHaveLength(0);
  }
});
