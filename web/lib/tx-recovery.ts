import { getAddress, isAddress, type Address, type Hash } from "viem";
import type { Profile } from "./contracts/profiles";

export type RecoveryOperation = "create" | "approve" | "pay" | "cancel";
export type RecoveryScope = {
  chainId: number;
  contractAddress: Address;
  profile: Profile;
};
export type PendingTransaction = RecoveryScope & {
  version: 2;
  account: Address;
  operation: RecoveryOperation;
  invoiceId: string | null;
  amount: string | null;
  createIntent: CreateIntent | null;
  hash: Hash;
  createdAt: number;
};

export type CreateIntent = {
  payer: Address;
  creator: Address;
  recipientA: Address;
  recipientB: Address;
  amount: string;
  shareBps: number;
  expiry: string;
  referenceHash: Hash;
};

export interface RecoveryStore {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

export const recoveryStorageKey = (scope: RecoveryScope) =>
  `arcsplit:pending-transaction:v1:${scope.chainId}:${scope.contractAddress.toLowerCase()}:${scope.profile}`;

export function browserRecoveryStore(): RecoveryStore {
  return {
    read(key) {
      if (typeof window === "undefined")
        throw new Error("Browser storage is unavailable.");
      return window.localStorage.getItem(key);
    },
    write(key, value) {
      if (typeof window === "undefined")
        throw new Error("Browser storage is unavailable.");
      window.localStorage.setItem(key, value);
    },
    remove(key) {
      if (typeof window === "undefined")
        throw new Error("Browser storage is unavailable.");
      window.localStorage.removeItem(key);
    },
  };
}

export function parsePendingTransaction(
  value: string,
  expected: RecoveryScope,
): PendingTransaction {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Saved transaction recovery data is corrupted.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Saved transaction recovery data is invalid.");
  const p = parsed as Record<string, unknown>;
  const fields = [
    "version",
    "chainId",
    "contractAddress",
    "profile",
    "account",
    "operation",
    "invoiceId",
    "amount",
    "createIntent",
    "hash",
    "createdAt",
  ];
  if (Object.keys(p).length !== fields.length || fields.some((k) => !(k in p)))
    throw new Error(
      "Saved transaction recovery data has an unsupported shape.",
    );
  if (p.version !== 2)
    throw new Error(
      "Saved transaction recovery data has an unsupported version.",
    );
  if (
    p.chainId !== expected.chainId ||
    p.profile !== expected.profile ||
    typeof p.contractAddress !== "string" ||
    !isAddress(p.contractAddress) ||
    p.contractAddress.toLowerCase() !== expected.contractAddress.toLowerCase()
  )
    throw new Error(
      "Saved transaction belongs to a different contract, network, or ABI profile.",
    );
  if (typeof p.account !== "string" || !isAddress(p.account))
    throw new Error("Saved transaction account is invalid.");
  if (
    !(["create", "approve", "pay", "cancel"] as unknown[]).includes(p.operation)
  )
    throw new Error("Saved transaction operation is invalid.");
  if (
    typeof p.hash !== "string" ||
    !/^0x[\da-fA-F]{64}$/.test(p.hash) ||
    /^0x0{64}$/i.test(p.hash)
  )
    throw new Error("Saved transaction hash is invalid.");
  const validNumber = (v: unknown, required: boolean) =>
    required
      ? typeof v === "string" && /^[1-9]\d*$/.test(v)
      : v === null || (typeof v === "string" && /^[1-9]\d*$/.test(v));
  const operation = p.operation as RecoveryOperation;
  const needsInvoice = operation !== "create";
  if (
    (needsInvoice ? !validNumber(p.invoiceId, true) : p.invoiceId !== null) ||
    (operation === "approve" ? !validNumber(p.amount, true) : p.amount !== null)
  )
    throw new Error("Saved transaction invoice details are invalid.");
  let createIntent: CreateIntent | null = null;
  if (operation === "create") {
    const v = p.createIntent;
    if (!v || typeof v !== "object" || Array.isArray(v))
      throw new Error("Saved invoice creation intent is invalid.");
    const i = v as Record<string, unknown>;
    if (
      Object.keys(i).length !== 8 ||
      ![
        "payer",
        "creator",
        "recipientA",
        "recipientB",
        "amount",
        "shareBps",
        "expiry",
        "referenceHash",
      ].every((k) => k in i) ||
      ![i.payer, i.creator, i.recipientA, i.recipientB].every(
        (x) => typeof x === "string" && isAddress(x),
      ) ||
      !validNumber(i.amount, true) ||
      !validNumber(i.expiry, true) ||
      typeof i.shareBps !== "number" ||
      !Number.isInteger(i.shareBps) ||
      i.shareBps < 1 ||
      i.shareBps > 9999 ||
      typeof i.referenceHash !== "string" ||
      !/^0x[\da-fA-F]{64}$/.test(i.referenceHash)
    )
      throw new Error("Saved invoice creation intent is invalid.");
    if (
      (i.recipientA as string).toLowerCase() ===
      (i.recipientB as string).toLowerCase()
    )
      throw new Error("Saved invoice creation participants are invalid.");
    createIntent = {
      payer: getAddress(i.payer as string),
      creator: getAddress(i.creator as string),
      recipientA: getAddress(i.recipientA as string),
      recipientB: getAddress(i.recipientB as string),
      amount: i.amount as string,
      shareBps: i.shareBps,
      expiry: i.expiry as string,
      referenceHash: i.referenceHash as Hash,
    };
    if (
      createIntent.creator.toLowerCase() !==
        (p.account as string).toLowerCase() ||
      (expected.profile === "kishore-v1" &&
        createIntent.payer.toLowerCase() !== createIntent.creator.toLowerCase())
    )
      throw new Error(
        "Saved invoice creation intent does not match its wallet or contract profile.",
      );
  } else if (p.createIntent !== null) {
    throw new Error(
      "Saved transaction creation intent does not match its operation.",
    );
  }
  if (
    typeof p.createdAt !== "number" ||
    !Number.isSafeInteger(p.createdAt) ||
    p.createdAt < 0
  )
    throw new Error("Saved transaction timestamp is invalid.");
  return {
    version: 2,
    chainId: p.chainId as number,
    contractAddress: getAddress(p.contractAddress),
    profile: p.profile as Profile,
    account: getAddress(p.account),
    operation,
    invoiceId: p.invoiceId as string | null,
    amount: p.amount as string | null,
    createIntent,
    hash: p.hash as Hash,
    createdAt: p.createdAt,
  };
}
