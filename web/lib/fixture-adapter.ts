import { assertPayable, type Address, type Invoice } from "./invoice";
export const FIXTURE_PAYER =
  "0x1111111111111111111111111111111111111111" as const;
export const FIXTURE_A = "0x2222222222222222222222222222222222222222" as const;
export const FIXTURE_B = "0x3333333333333333333333333333333333333333" as const;
export type Scenario = "success" | "reject" | "fail";
// Domain adapter only. No assumed Solidity signatures, no fabricated hashes.
export interface InvoiceAdapter {
  readonly mode: "fixture";
  getInvoice(id: string): Invoice;
  createInvoice(
    input: Omit<Invoice, "id" | "status" | "createdAt" | "history">,
  ): Invoice;
  allowance(payer: Address): bigint;
  approve(payer: Address, amount: bigint, scenario: Scenario): Promise<void>;
  payInvoice(id: string, payer: Address, scenario: Scenario): Promise<Invoice>;
  cancelInvoice(id: string, payer: Address): Invoice;
}
export class FixtureAdapter implements InvoiceAdapter {
  readonly mode = "fixture" as const;
  private invoices = new Map<string, Invoice>();
  private allowances = new Map<string, bigint>();
  private busy = new Set<string>();
  constructor() {
    this.createInvoice({
      payer: FIXTURE_PAYER,
      recipientA: FIXTURE_A,
      recipientB: FIXTURE_B,
      amount: 100000000n,
      shareBps: 7000,
      expiry: Date.now() + 86400000,
    });
  }
  getInvoice(id: string) {
    const i = this.invoices.get(id);
    if (!i) throw new Error("Invoice not found in this demo session.");
    return structuredClone(i);
  }
  createInvoice(
    input: Omit<Invoice, "id" | "status" | "createdAt" | "history">,
  ) {
    const now = Date.now();
    const i: Invoice = {
      ...input,
      id: String(this.invoices.size + 1),
      status: "open",
      createdAt: now,
      history: [{ at: now, action: "Fixture invoice created" }],
    };
    this.invoices.set(i.id, i);
    return structuredClone(i);
  }
  allowance(payer: Address) {
    return this.allowances.get(payer.toLowerCase()) ?? 0n;
  }
  private async simulate(scenario: Scenario) {
    await new Promise((r) => setTimeout(r, 800));
    if (scenario === "reject")
      throw new Error(
        "Wallet request rejected. Nothing changed; you can try again.",
      );
    if (scenario === "fail")
      throw new Error(
        "Simulated transaction failed. No payout occurred; retry when ready.",
      );
  }
  async approve(payer: Address, amount: bigint, scenario: Scenario) {
    await this.simulate(scenario);
    this.allowances.set(payer.toLowerCase(), amount);
  }
  async payInvoice(id: string, payer: Address, scenario: Scenario) {
    if (this.busy.has(id)) throw new Error("Payment already pending.");
    this.busy.add(id);
    try {
      const before = this.getInvoice(id);
      assertPayable(before, payer);
      if (this.allowance(payer) < before.amount)
        throw new Error("Approve the required amount first.");
      await this.simulate(scenario);
      const i = this.getInvoice(id);
      assertPayable(i, payer);
      if (this.allowance(payer) < i.amount)
        throw new Error("Allowance changed. Approve again.");
      if (i.amount > 1000000000n)
        throw new Error("Insufficient fixture balance (1,000 USDC).");
      i.status = "paid";
      i.paidAt = Date.now();
      i.history.push({
        at: i.paidAt,
        action: "Fixture payout simulated — no onchain transaction",
      });
      this.invoices.set(id, i);
      this.allowances.set(
        payer.toLowerCase(),
        this.allowance(payer) - i.amount,
      );
      return structuredClone(i);
    } finally {
      this.busy.delete(id);
    }
  }
  cancelInvoice(id: string, payer: Address) {
    const i = this.getInvoice(id);
    assertPayable(i, payer);
    i.status = "cancelled";
    i.history.push({ at: Date.now(), action: "Fixture invoice cancelled" });
    this.invoices.set(id, i);
    return structuredClone(i);
  }
}
