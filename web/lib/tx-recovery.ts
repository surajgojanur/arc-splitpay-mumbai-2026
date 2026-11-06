import { getAddress, isAddress, type Address, type Hash } from "viem";
import type { Profile } from "./contracts/profiles";

export type RecoveryOperation = "create" | "approve" | "pay" | "cancel";
export type RecoveryScope = {
  chainId: number;
  contractAddress: Address;
  profile: Profile;
};
export type PendingTransaction = RecoveryScope & {
  version: 1;
  account: Address;
  operation: RecoveryOperation;
  invoiceId: string | null;
  amount: string | null;
  hash: Hash;
  createdAt: number;
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
    "hash",
    "createdAt",
  ];
  if (Object.keys(p).length !== fields.length || fields.some((k) => !(k in p)))
    throw new Error(
      "Saved transaction recovery data has an unsupported shape.",
    );
  if (p.version !== 1)
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
  if (
    typeof p.createdAt !== "number" ||
    !Number.isSafeInteger(p.createdAt) ||
    p.createdAt < 0
  )
    throw new Error("Saved transaction timestamp is invalid.");
  return {
    version: 1,
    chainId: p.chainId as number,
    contractAddress: getAddress(p.contractAddress),
    profile: p.profile as Profile,
    account: getAddress(p.account),
    operation,
    invoiceId: p.invoiceId as string | null,
    amount: p.amount as string | null,
    hash: p.hash as Hash,
    createdAt: p.createdAt,
  };
}
