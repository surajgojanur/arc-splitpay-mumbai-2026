import { type Abi, keccak256, toBytes } from "viem";
import { studioAbi } from "./studio-abi";
import { kishoreAbi } from "./kishore-abi";
export type Profile = "studio-v1" | "kishore-v1";
export const abis: Record<Profile, Abi> = {
  "studio-v1": studioAbi,
  "kishore-v1": kishoreAbi,
};
export const abiHash = (profile: Profile) =>
  keccak256(toBytes(JSON.stringify(abis[profile])));
