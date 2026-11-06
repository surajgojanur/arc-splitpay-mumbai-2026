"use client";
import { useEffect, useState } from "react";
import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { arc, readUsdc } from "./network";
import type { Address } from "./invoice";
type Provider = EIP1193Provider & {
  on?: (event: string, listener: () => void) => void;
  removeListener?: (event: string, listener: () => void) => void;
};
function provider(): Provider {
  const ethereum = (window as Window & { ethereum?: Provider }).ethereum;
  if (!ethereum)
    throw new Error(
      "No wallet found. Install an injected EVM wallet, or use the demo wallet.",
    );
  return ethereum;
}
export function useWallet() {
  const [address, setAddress] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [balance, setBalance] = useState<bigint>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let p: Provider;
    try {
      p = provider();
    } catch {
      return;
    }
    const reset = () => {
      setAddress(undefined);
      setBalance(undefined);
      setChainId(undefined);
      setError("Wallet account or network changed. Connect again to refresh.");
    };
    p.on?.("accountsChanged", reset);
    p.on?.("chainChanged", reset);
    return () => {
      p.removeListener?.("accountsChanged", reset);
      p.removeListener?.("chainChanged", reset);
    };
  }, []);
  async function connect() {
    setBusy(true);
    setError("");
    setBalance(undefined);
    try {
      const client = createWalletClient({ transport: custom(provider()) });
      const [a] = await client.requestAddresses();
      setAddress(a);
      const id = await client.getChainId();
      setChainId(id);
      if (id === arc.id) setBalance(await readUsdc(a));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet connection failed.");
    } finally {
      setBusy(false);
    }
  }
  async function switchNetwork() {
    setBusy(true);
    setError("");
    try {
      const client = createWalletClient({ transport: custom(provider()) });
      try {
        await client.switchChain({ id: arc.id });
      } catch (e) {
        if ((e as { code?: number }).code === 4902)
          await client.addChain({ chain: arc });
        else throw e;
      }
      await connect();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network switch rejected.");
    } finally {
      setBusy(false);
    }
  }
  return {
    address,
    chainId,
    balance,
    error,
    busy,
    connect,
    switchNetwork,
    clearError: () => setError(""),
    disconnect: () => {
      setAddress(undefined);
      setBalance(undefined);
      setChainId(undefined);
    },
  };
}
