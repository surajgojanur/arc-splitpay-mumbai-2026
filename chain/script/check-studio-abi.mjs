import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const selection = JSON.parse(await readFile(new URL("../studio-candidate/selection.json", import.meta.url), "utf8"));
assert.equal(selection.profile, "studio-v1", "Selection must use the Studio ABI profile");
assert.equal(selection.status, "proposed-for-review", "This record is a review proposal, not deployment approval");
for (const path of ["src/ArcSplit.sol", "abi/ArcSplit.studio-v1.json", "foundry.toml", "package-lock.json"]) {
  const bytes = await readFile(new URL(`../studio-candidate/${path}`, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), selection.sha256[path], `Selected ${path} changed; renew source/profile review`);
}

const candidate = JSON.parse(await readFile(new URL("../studio-candidate/abi/ArcSplit.studio-v1.json", import.meta.url), "utf8"));
const preserved = JSON.parse(await readFile(new URL("../../docs/studio-original/docs/handoff/ArcSplit.abi.json", import.meta.url), "utf8"));
const compiledArtifact = JSON.parse(await readFile(new URL("../studio-candidate/out/ArcSplit.sol/ArcSplit.json", import.meta.url), "utf8"));
assert.deepEqual(candidate, preserved, "Studio candidate ABI differs from preserved Studio export");
assert.deepEqual(compiledArtifact.abi, candidate, "Compiled Studio candidate ABI differs from the checked-in candidate ABI");
console.log(`Compiled Studio candidate ABI matches preserved export (${candidate.length} entries).`);
