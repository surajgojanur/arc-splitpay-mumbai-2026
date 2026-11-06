// Writes chain/abi/ArcSplit.json (plain ABI array) from the Foundry build output. Run `forge build` first.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const artifact = JSON.parse(readFileSync(join(root, "out/ArcSplit.sol/ArcSplit.json"), "utf8"));
mkdirSync(join(root, "abi"), { recursive: true });
writeFileSync(join(root, "abi/ArcSplit.json"), JSON.stringify(artifact.abi, null, 2) + "\n");
console.log(`abi/ArcSplit.json: ${artifact.abi.length} entries, solc ${artifact.metadata.compiler.version}`);
