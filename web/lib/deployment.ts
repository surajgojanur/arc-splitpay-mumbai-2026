import { isAddress, zeroAddress, type Address, type Hash } from "viem";
import { arc, USDC } from "./network";
import { abiHash, type Profile } from "./contracts/profiles";
export type Deployment = {
  profile: Profile;
  chainId: number;
  contractAddress: Address;
  usdcAddress: Address;
  usdcDecimals: 6;
  deploymentBlock: bigint;
  deploymentTransactionHash: Hash;
  runtimeCodeHash: Hash;
  abiHash: Hash;
  explorerUrl: string;
};
const hash = (v: unknown): v is Hash =>
  typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v) && !/^0x0+$/.test(v);
export function parseDeployment(input: unknown): Deployment {
  if (!input || typeof input !== "object")
    throw new Error("Contract not deployed — testnet payments unavailable.");
  const d = input as Record<string, unknown>;
  if (d.profile !== "studio-v1" && d.profile !== "kishore-v1")
    throw new Error("Choose the reviewed contract ABI profile.");
  if (
    d.chainId !== arc.id ||
    d.usdcDecimals !== 6 ||
    typeof d.usdcAddress !== "string" ||
    d.usdcAddress.toLowerCase() !== USDC.toLowerCase() ||
    d.explorerUrl !== arc.blockExplorers.default.url
  )
    throw new Error("Invalid Arc Testnet deployment configuration.");
  if (
    typeof d.contractAddress !== "string" ||
    !isAddress(d.contractAddress) ||
    d.contractAddress === zeroAddress ||
    d.contractAddress.toLowerCase() === USDC.toLowerCase()
  )
    throw new Error("Invalid invoice contract address.");
  if (
    !hash(d.deploymentTransactionHash) ||
    !hash(d.runtimeCodeHash) ||
    d.abiHash !== abiHash(d.profile)
  )
    throw new Error(
      "Reviewed deployment receipt, runtime code hash and matching ABI hash are required.",
    );
  if (!(
    (typeof d.deploymentBlock === "string" &&
      /^\d+$/.test(d.deploymentBlock)) ||
    (typeof d.deploymentBlock === "number" &&
      Number.isSafeInteger(d.deploymentBlock) &&
      d.deploymentBlock >= 0)
  ))
    throw new Error("Invalid deployment block.");
  return {
    profile: d.profile,
    chainId: arc.id,
    contractAddress: d.contractAddress,
    usdcAddress: USDC,
    usdcDecimals: 6,
    deploymentBlock: BigInt(d.deploymentBlock),
    deploymentTransactionHash: d.deploymentTransactionHash,
    runtimeCodeHash: d.runtimeCodeHash,
    abiHash: d.abiHash as Hash,
    explorerUrl: arc.blockExplorers.default.url,
  };
}
