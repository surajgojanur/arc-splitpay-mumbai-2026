# Integration handoff

Branch `feat/suraj-arcstudio-integration` is stacked on `feat/suraj-frontend` (PR #8, commit 454a084). Review this integration against that branch to avoid duplicating PR #8. Neither #8 nor Kishore PR #9 is merged automatically. Original checkout and its untracked Studio download are preserved; integration uses the separate `/home/god/Documents/github/arc-splitpay-integration` worktree.

## Actual code and ownership

- `docs/studio-original/`: immutable selected Studio source, ABI, tests, handoff/deploy configuration and original architecture. `selected-inventory.json` contains SHA256 hashes; the full inventory lists 195 original files. Nested binary handoff archives are corrupt and rejected, not imported.
- `web/lib/contracts/`: exact Studio and Kishore ABI snapshots plus explicit profile/hash helpers. Kishore snapshot comes read-only from PR #9 at a3ac1b7. No contract ABI was invented.
- `web/lib/deployment.ts`: strict public configuration parser; `web/config/deployment.json` is **null**, so live operation is disabled.
- `web/lib/live-service.ts`: typed domain service over injectable Gateway; profile-specific normalization, validation, simulation, confirmations, events, receipt proof, bounded history and reload-safe pending-transaction recovery.
- `web/lib/live-gateway.ts`: viem RPC and injected-wallet adapter. No credentials/server wallet.
- `web/components/live-panel.tsx`: dedicated live create/read/approve/pay/cancel interface. Existing `dashboard.tsx` fixture views remain functional and labelled DEMO DATA.
- Tests: original fixture cases preserved; live-service regression tests use fake transport explicitly, not a deployed contract. New browser evidence goes to `web/public/screenshots/integration/`; prior screenshots are unchanged.

No Suraj changes to `chain/**` or `docs/chain-handoff.md`. Kishore must select/reconcile the exact contract in issue #1 before deployment. See [comparison matrix](studio-comparison.md) for constructor checks, signatures, status, expiry, cancellation and security differences.

## Later activation — not performed in this task

1. Kishore reviews the preserved Studio baseline against independent PR #9 and records the chosen source/profile in #1. Changes to Solidity/tests/deployment remain exclusively his. Preserve Studio provenance even if adapting its contract.
2. Review the exact source, Solidity/compiler/dependency settings, tests and runtime, then deploy later using an approved dedicated team-controlled Arc Testnet wallet. Never use Studio's shared wallet or an unknown account. This integration does not authorize deployment or payment.
3. Kishore provides `chain/abi/ArcSplit.json`, `chain/deployments/arc-testnet.json`, source commit/build information, verification/explorer links and the real direct-deployment receipt. If the chosen ABI differs from either snapshot, update agreement and frontend tests first.
4. Independently inspect the deployed runtime against the reviewed build (including immutable USDC substitution). Obtain its expected `keccak256(runtimeCode)` from that verified result. Do not bless arbitrary RPC bytecode just by hashing it.
5. Prepare the public frontend snapshot:

```
npm run prepare:deployment -w web -- /absolute/path/to/reviewed-metadata.json studio-v1 0x<reviewed-runtime-code-hash>
# Or explicitly choose kishore-v1 if that exact reviewed contract was deployed.
```

The script adds the exact ABI fingerprint and writes only `web/config/deployment.json`; it never deploys/signs or writes chain/**. Review the diff and obtain Kishore approval. Rebuild the app after configuration changes. Do not set fake addresses, permit arbitrary tokens, or place keys in this JSON. Legacy NEXT_PUBLIC_CONTRACT_ADDRESS is not an activation path.

Required source metadata: `chainId:5042002`, `contractAddress`, `usdcAddress:0x3600000000000000000000000000000000000000`, `usdcDecimals:6`, `deploymentBlock`, `deploymentTransactionHash`; handoff should additionally retain compilerVersion/sourceCommit/explorerUrl. Prepared config also records `profile`, `abiHash`, `runtimeCodeHash`, official `explorerUrl`. The verifier deliberately supports direct creation receipts (`contractAddress` must match); factory/proxy deployments require a separately reviewed verification extension.

6. Open Live payments and verify the deployment. Reads/writes revalidate RPC chain, code hash, token, decimals and successful deployment receipt/block/address. Connect the approved human wallet and explicitly select Arc Testnet. No live mode/signature starts automatically.
7. Create a small invoice, approve only its amount, then deliberately confirm payment. Verify successful transaction, InvoicePaid, both USDC Transfer logs, recipient balance changes and timestamp on Arc Testnet. Test duplicate settlement, wrong payer, expiry and cancellation. Record actual transaction hashes and explorer links in #4/#5. Leave extra USDC for gas: native gas accounting has 18 decimals, ERC20 amounts use 6.
8. Copy the real judge-openable Studio project URL, record final Studio demonstration/video and update the submission checklist. Export suffix 4zjjiq and hosted app URLs are not substitutes.

## Honest operational limits

Both contracts assume official non-fee-on-transfer USDC. USDC blocklisting can prevent settlement atomically; invoices can be cancelled. No database is added. History queries are paginated over at most the last 20,000 blocks (or from deployment if more recent), and partial/unavailable history is labelled. A paid contract status without verified logs does not produce a verified payout receipt.

A submitted hash is stored in a versioned browser record scoped to chain, contract and ABI profile, with the originating account, operation and invoice context. Reload restores the unresolved state; writes stay blocked until read-only recovery verifies the original transaction envelope and receipt. Payment recovery also checks the paid invoice, matching `InvoicePaid`, and both exact USDC transfers. Approval and cancellation are verified against their own evidence and never shown as payment proof. Recovery never signs or rebroadcasts. If the RPC cannot find the transaction or its evidence is incomplete, the lock stays in place and the UI links to the real hash on the official explorer. Inspect and reconcile before any manual storage cleanup.

Storage access errors do not crash the app; the current tab keeps an in-memory lock and warns that the pending hash will not survive reload. Corrupt or unsupported saved records fail closed and require manual wallet/explorer reconciliation. Completed and reverted records are removed after their operation evidence is checked; unresolved or unverifiable records have no automatic expiry. No account here has executed a real payment; all transport tests use synthetic logs and clearly labelled fixtures.

Full npm audit still reports 8 moderate development lint-chain findings inherited from the baseline; production audit was previously clean. This integration does not claim an independent contract audit or submission eligibility.
