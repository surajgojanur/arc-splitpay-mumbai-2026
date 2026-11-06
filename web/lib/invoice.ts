import { isAddress, parseUnits, formatUnits, zeroAddress } from "viem";
export type Address = `0x${string}`;
export type InvoiceStatus = "open" | "paid" | "cancelled";
export type Invoice = {
  id: string;
  payer: Address;
  recipientA: Address;
  recipientB: Address;
  amount: bigint;
  shareBps: number;
  expiry: number;
  status: InvoiceStatus;
  createdAt: number;
  paidAt?: number;
  history: { at: number; action: string }[];
};
export type Draft = {
  payer: string;
  recipientA: string;
  recipientB: string;
  amount: string;
  percent: string;
  expiry: string;
};
export const money = (value: bigint) => formatUnits(value, 6);
export function split(amount: bigint, bps: number): [bigint, bigint] {
  const a = (amount * BigInt(bps)) / 10000n;
  return [a, amount - a];
}
export function validate(d: Draft, now = Date.now()): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const key of ["payer", "recipientA", "recipientB"] as const)
    if (!isAddress(d[key]) || d[key].toLowerCase() === zeroAddress)
      errors[key] = "Enter a valid, nonzero wallet address.";
  if (
    isAddress(d.recipientA) &&
    isAddress(d.recipientB) &&
    d.recipientA.toLowerCase() === d.recipientB.toLowerCase()
  )
    errors.recipientB = "Choose two different recipients.";
  let amount = 0n;
  if (!/^\d+(\.\d{1,6})?$/.test(d.amount))
    errors.amount = "Use a positive USDC amount with at most 6 decimal places.";
  else {
    amount = parseUnits(d.amount, 6);
    if (amount <= 0n || amount > 2n ** 256n - 1n)
      errors.amount = "Amount must be positive and fit uint256.";
  }
  const percent = Number(d.percent);
  if (!/^\d+(\.\d{1,2})?$/.test(d.percent) || percent <= 0 || percent >= 100)
    errors.percent = "Recipient A must receive between 0.01% and 99.99%.";
  else if (
    amount > 0n &&
    split(amount, Math.round(percent * 100)).some((x) => x === 0n)
  )
    errors.amount = "Amount is too small to give both recipients a payout.";
  if (!Number.isFinite(Date.parse(d.expiry)) || Date.parse(d.expiry) <= now)
    errors.expiry = "Choose an expiry in the future.";
  return errors;
}
export function assertPayable(i: Invoice, caller: Address, now = Date.now()) {
  if (i.payer.toLowerCase() !== caller.toLowerCase())
    throw new Error("Only the designated payer can settle this invoice.");
  if (i.status !== "open") throw new Error(`Invoice is already ${i.status}.`);
  if (now >= i.expiry) throw new Error("This invoice has expired.");
}
export function fromDraft(
  d: Draft,
): Omit<Invoice, "id" | "status" | "createdAt" | "history"> {
  if (Object.keys(validate(d)).length)
    throw new Error("Correct the invoice fields first.");
  return {
    payer: d.payer as Address,
    recipientA: d.recipientA as Address,
    recipientB: d.recipientB as Address,
    amount: parseUnits(d.amount, 6),
    shareBps: Math.round(Number(d.percent) * 100),
    expiry: Date.parse(d.expiry),
  };
}
