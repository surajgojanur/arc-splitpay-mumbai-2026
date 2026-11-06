// Read-only verification and public config preparation. Never deploys, signs, loads .env, or writes chain/**.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createPublicClient,
  erc20Abi,
  http,
  isAddress,
  keccak256,
  toBytes,
  zeroAddress,
} from "viem";
import { arc, USDC } from "../lib/network.ts";
import { studioAbi } from "../lib/contracts/studio-abi.ts";
import { kishoreAbi } from "../lib/contracts/kishore-abi.ts";

const abiFor = (profile) => (profile === "studio-v1" ? studioAbi : kishoreAbi);
const isHash = (value) =>
  typeof value === "string" &&
  /^0x[0-9a-fA-F]{64}$/.test(value) &&
  !/^0x0{64}$/i.test(value);

export function prepareDeploymentMetadata(d, profile, runtimeCodeHash) {
  if (profile !== "studio-v1" && profile !== "kishore-v1")
    throw new Error("Choose one reviewed contract ABI profile.");
  if (
    !d ||
    typeof d !== "object" ||
    d.chainId !== arc.id ||
    d.usdcDecimals !== 6 ||
    typeof d.usdcAddress !== "string" ||
    d.usdcAddress.toLowerCase() !== USDC.toLowerCase() ||
    !isAddress(d.contractAddress || "") ||
    d.contractAddress.toLowerCase() === zeroAddress.toLowerCase() ||
    d.contractAddress.toLowerCase() === USDC.toLowerCase() ||
    !isHash(d.deploymentTransactionHash) ||
    (typeof d.deploymentBlock === "number" &&
      !Number.isSafeInteger(d.deploymentBlock)) ||
    !/^\d+$/.test(String(d.deploymentBlock)) ||
    BigInt(d.deploymentBlock) < 0n ||
    typeof d.compilerVersion !== "string" ||
    !/^0\.8\.28(?:\+.*)?$/.test(d.compilerVersion) ||
    typeof d.sourceCommit !== "string" ||
    !/^[0-9a-f]{7,64}$/i.test(d.sourceCommit) ||
    d.explorerUrl !==
      `${arc.blockExplorers.default.url}/address/${d.contractAddress}`
  )
    throw new Error("Missing or invalid Arc Testnet deployment metadata.");
  if (!isHash(runtimeCodeHash))
    throw new Error("A reviewed, nonzero runtime code hash is required.");
  return {
    profile,
    chainId: arc.id,
    contractAddress: d.contractAddress,
    usdcAddress: USDC,
    usdcDecimals: 6,
    deploymentBlock: String(d.deploymentBlock),
    deploymentTransactionHash: d.deploymentTransactionHash,
    runtimeCodeHash,
    abiHash: keccak256(toBytes(JSON.stringify(abiFor(profile)))),
    explorerUrl: arc.blockExplorers.default.url,
  };
}

export async function verifyArcDeployment(
  metadata,
  client = createPublicClient({ chain: arc, transport: http() }),
) {
  if ((await client.getChainId()) !== metadata.chainId)
    throw new Error("RPC network does not match the deployment metadata.");
  const [receipt, code, token, decimals] = await Promise.all([
    client.getTransactionReceipt({ hash: metadata.deploymentTransactionHash }),
    client.getCode({ address: metadata.contractAddress }),
    client.readContract({
      address: metadata.contractAddress,
      abi: abiFor(metadata.profile),
      functionName: "usdc",
    }),
    client.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "decimals",
    }),
  ]);
  if (
    receipt.status !== "success" ||
    receipt.transactionHash?.toLowerCase() !==
      metadata.deploymentTransactionHash.toLowerCase() ||
    receipt.blockNumber !== BigInt(metadata.deploymentBlock) ||
    !receipt.contractAddress ||
    receipt.contractAddress.toLowerCase() !==
      metadata.contractAddress.toLowerCase()
  )
    throw new Error(
      "Arc Testnet receipt is not a successful direct deployment matching this address and block.",
    );
  if (!code || code === "0x" || keccak256(code) !== metadata.runtimeCodeHash)
    throw new Error(
      "Deployed runtime bytecode does not match the reviewed hash.",
    );
  if (
    typeof token !== "string" ||
    token.toLowerCase() !== USDC.toLowerCase() ||
    decimals !== 6
  )
    throw new Error(
      "Deployment does not use official 6-decimal Arc Testnet USDC.",
    );
}

async function main() {
  const [input, profile, runtimeCodeHash] = process.argv.slice(2);
  if (!input || !profile || !runtimeCodeHash)
    throw new Error(
      "Usage: npm run prepare:deployment -w web -- /absolute/path/to/receipt-backed-metadata.json studio-v1|kishore-v1 0x<reviewed-runtime-code-hash>",
    );
  const d = JSON.parse(await readFile(input, "utf8"));
  const result = prepareDeploymentMetadata(d, profile, runtimeCodeHash);
  await verifyArcDeployment(result);
  await writeFile(
    new URL("../config/deployment.json", import.meta.url),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    "Read-only Arc Testnet receipt, runtime, token, decimals and chain checks passed. Review web/config/deployment.json; no transaction was submitted.",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main();
