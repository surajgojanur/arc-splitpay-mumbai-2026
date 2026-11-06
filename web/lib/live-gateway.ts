"use client";
import {
  createWalletClient,
  custom,
  getAbiItem,
  type AbiEvent,
  type TransactionReceipt,
} from "viem";
import { arc, publicClient } from "./network";
import { provider } from "./wallet";
import { type Gateway, type Log, type Receipt } from "./live-service";
const wallet = () =>
  createWalletClient({ chain: arc, transport: custom(provider()) });
function receipt(r: TransactionReceipt): Receipt {
  return {
    status: r.status,
    transactionHash: r.transactionHash,
    blockNumber: r.blockNumber,
    contractAddress: r.contractAddress,
    logs: r.logs.map((l) => ({
      address: l.address,
      data: l.data,
      topics: l.topics as Log["topics"],
      transactionHash: r.transactionHash,
      blockNumber: r.blockNumber,
      logIndex: l.logIndex,
    })),
  };
}
export const liveGateway: Gateway = {
  chainId: () => publicClient.getChainId(),
  walletChainId: () => wallet().getChainId(),
  account: async () => (await wallet().getAddresses())[0],
  code: (address) => publicClient.getCode({ address }),
  read: (call) => publicClient.readContract(call),
  simulate: async (call, account) => {
    await publicClient.simulateContract({ ...call, account });
  },
  send: (call, account) =>
    wallet().writeContract({ ...call, account, chain: arc }),
  confirm: async (hash) =>
    receipt(
      await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 120000,
      }),
    ),
  receipt: async (hash) =>
    receipt(await publicClient.getTransactionReceipt({ hash })),
  transaction: async (hash) => {
    const tx = await publicClient.getTransaction({ hash });
    return {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      input: tx.input,
    };
  },
  block: async (number) => {
    const b = await publicClient.getBlock(
      number === undefined ? {} : { blockNumber: number },
    );
    return { number: b.number, timestamp: b.timestamp };
  },
  logs: async (address, abi, event, id, fromBlock, toBlock) => {
    const item = getAbiItem({ abi, name: event }) as AbiEvent;
    const logs = await publicClient.getLogs({
      address,
      event: item,
      args: { id },
      fromBlock,
      toBlock,
      strict: true,
    });
    return logs
      .filter(
        (l) =>
          l.blockNumber !== null && l.transactionHash !== null && !l.removed,
      )
      .map((l) => ({
        address: l.address,
        data: l.data,
        topics: l.topics as Log["topics"],
        transactionHash: l.transactionHash!,
        blockNumber: l.blockNumber!,
        logIndex: l.logIndex!,
      }));
  },
};
