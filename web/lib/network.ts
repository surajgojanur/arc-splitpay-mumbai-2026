import { createPublicClient, defineChain, erc20Abi, http } from "viem";
// Sources verified 2026-11-06: docs.arc.io/arc/references/{connect-to-arc,contract-addresses}
export const arc = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.testnet.arc.io" },
  },
  testnet: true,
});
export const USDC = "0x3600000000000000000000000000000000000000" as const;
export const publicClient = createPublicClient({
  chain: arc,
  transport: http(),
});
export async function readUsdc(address: `0x${string}`) {
  const [balance, decimals] = await Promise.all([
    publicClient.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    }),
    publicClient.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "decimals",
    }),
  ]);
  if (decimals !== 6)
    throw new Error("Unexpected USDC decimals. Live balance disabled.");
  return balance;
}
