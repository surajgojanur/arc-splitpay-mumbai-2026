import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  encodeAbiParameters,
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
import {
  FIXTURE_PAYER as payer,
  FIXTURE_A as a,
  FIXTURE_B as b,
} from "../lib/fixture-adapter";
const contract = "0x4444444444444444444444444444444444444444" as Address;
const deployHash = `0x${"aa".repeat(32)}` as Hash;
const txHash = `0x${"bb".repeat(32)}` as Hash;
const code = "0x60006000" as Hex;
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
  async send(call: Call) {
    if (this.reject)
      throw Object.assign(new Error("User rejected"), { code: 4001 });
    this.sent.push(call);
    this.last = call;
    return txHash;
  }
  async confirm() {
    if (this.timeout) throw new Error("Confirmation timeout");
    if (!this.fail) {
      if (this.last?.functionName === "approve") this.allowance = 100000000n;
      if (
        ["settleInvoice", "payInvoice"].includes(this.last?.functionName || "")
      )
        this.status = 2;
      if (this.last?.functionName === "cancelInvoice") this.status = 3;
    }
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
    return {
      status: this.fail ? "reverted" : "success",
      transactionHash: txHash,
      blockNumber: 11n,
      logs: this.transactionLogs(),
    };
  }
  transactionLogs() {
    const event =
      this.last?.functionName === "createInvoice"
        ? "InvoiceCreated"
        : this.last?.functionName === "cancelInvoice"
          ? "InvoiceCancelled"
          : "InvoicePaid";
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
      cancelledBy: this.selected,
    };
    const e = log(this.profile, event, args);
    if (this.wrongEventAddress) e.address = a;
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
    expect(
      getAbiItem({ abi: abis["studio-v1"], name: "settleInvoice" }),
    ).toBeTruthy();
    expect(
      getAbiItem({ abi: abis["kishore-v1"], name: "payInvoice" }),
    ).toBeTruthy();
    expect(abiHash("studio-v1")).not.toBe(abiHash("kishore-v1"));
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
    function setup() {
      const g = new FakeGateway(profile);
      const states: TxState[] = [];
      return {
        g,
        states,
        s: new LiveInvoiceService(g, config(profile), (x) => states.push(x)),
      };
    }
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
    it("retains submitted hash after timeout and blocks retries until recovered", async () => {
      const { g, s, states } = setup();
      g.timeout = true;
      await expect(s.approve(1n, payer)).rejects.toThrow("timeout");
      expect(s.pendingHash).toBe(txHash);
      expect(states.at(-1)?.hash).toBe(txHash);
      await expect(s.approve(1n, payer)).rejects.toThrow("unresolved");
      expect(g.sent).toHaveLength(1);
      await s.recoverPending();
      expect(s.pendingHash).toBeUndefined();
    });
    it("does not accept foreign events or missing USDC transfer proof", async () => {
      const { g, s } = setup();
      g.allowance = 100000000n;
      g.omitTransfers = true;
      await expect(s.payInvoice(1n, payer)).rejects.toThrow(
        "both expected USDC",
      );
      g.status = 1;
      g.omitTransfers = false;
      g.wrongEventAddress = true;
      await expect(s.payInvoice(1n, payer)).rejects.toThrow(
        "InvoicePaid event missing",
      );
    });
    it("stops on simulation revert before wallet signing", async () => {
      const { g, s } = setup();
      g.simulateError = true;
      await expect(s.approve(1n, payer)).rejects.toThrow("simulation");
      expect(g.sent).toHaveLength(0);
    });
  },
);
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
