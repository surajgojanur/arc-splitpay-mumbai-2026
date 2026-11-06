import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const candidate = JSON.parse(await readFile(new URL("../studio-candidate/abi/ArcSplit.studio-v1.json", import.meta.url), "utf8"));
const preserved = JSON.parse(await readFile(new URL("../../docs/studio-original/docs/handoff/ArcSplit.abi.json", import.meta.url), "utf8"));
const compiledArtifact = JSON.parse(await readFile(new URL("../studio-candidate/out/ArcSplit.sol/ArcSplit.json", import.meta.url), "utf8"));
assert.deepEqual(candidate, preserved, "Studio candidate ABI differs from preserved Studio export");
assert.deepEqual(compiledArtifact.abi, candidate, "Compiled Studio candidate ABI differs from the checked-in candidate ABI");
console.log(`Compiled Studio candidate ABI matches preserved export (${candidate.length} entries).`);
