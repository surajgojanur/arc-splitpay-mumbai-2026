// Run only after Kishore's source/profile and deployed runtime have been reviewed.
// Reads public metadata only. Never deploys, signs, loads .env or writes chain/**.
import { readFile, writeFile } from "node:fs/promises";
import { keccak256, toBytes, isAddress } from "viem";
import { studioAbi } from "../lib/contracts/studio-abi.ts";
import { kishoreAbi } from "../lib/contracts/kishore-abi.ts";
const [input, profile, runtimeCodeHash] = process.argv.slice(2);
if (
  !input ||
  !["studio-v1", "kishore-v1"].includes(profile) ||
  !/^0x[0-9a-fA-F]{64}$/.test(runtimeCodeHash || "")
) {
  throw new Error(
    "Usage: npm run prepare:deployment -w web -- /absolute/path/to/reviewed-metadata.json studio-v1|kishore-v1 0x<reviewed-runtime-code-hash>",
  );
}
const d = JSON.parse(await readFile(input, "utf8"));
if (
  d.chainId !== 5042002 ||
  d.usdcDecimals !== 6 ||
  d.usdcAddress?.toLowerCase() !==
    "0x3600000000000000000000000000000000000000" ||
  !isAddress(d.contractAddress || "") ||
  !/^0x[0-9a-fA-F]{64}$/.test(d.deploymentTransactionHash || "") ||
  !/^\d+$/.test(String(d.deploymentBlock))
)
  throw new Error("Missing/invalid Arc Testnet deployment metadata.");
const result = {
  profile,
  chainId: d.chainId,
  contractAddress: d.contractAddress,
  usdcAddress: d.usdcAddress,
  usdcDecimals: 6,
  deploymentBlock: String(d.deploymentBlock),
  deploymentTransactionHash: d.deploymentTransactionHash,
  runtimeCodeHash,
  abiHash: keccak256(
    toBytes(JSON.stringify(profile === "studio-v1" ? studioAbi : kishoreAbi)),
  ),
  explorerUrl: "https://explorer.testnet.arc.io",
};
await writeFile(
  new URL("../config/deployment.json", import.meta.url),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  "Prepared public configuration. Review the diff before committing. Runtime verification still required; no transaction was submitted.",
);
