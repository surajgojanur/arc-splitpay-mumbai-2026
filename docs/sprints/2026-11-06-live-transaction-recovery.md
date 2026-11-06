# Sprint handoff: reload-safe live transaction recovery

## Checkpoint

- Starting `origin/main`: `9d38ff6c4e6e05fc77df0b6f6f45626e8798cd07`.
- Feature branch: `feat/live-tx-recovery-hardening-20261106`.
- Implementation commit: `4c035d149426ad1cbace1988540b8a531e113af9`.
- Draft review PR #11: https://github.com/surajgojanur/arc-splitpay-mumbai-2026/pull/11 (target `main`).
- PR #10 remained open as a draft at `https://github.com/surajgojanur/arc-splitpay-mumbai-2026/pull/10`; its integration commits were already ancestors of `main`. The latest observed PR checks passed. No PR state or issue state was changed.
- Repository-specific ownership rules were reviewed. No files under `chain/**`, `docs/chain-handoff.md`, or immutable `docs/studio-original/**` were edited.

## Baseline and implementation

Baseline on the clean worktree after `npm ci`: `npm run typecheck`, `npm run lint`, and `npm test` passed (59 tests). The main reliability defect was that a transaction hash and retry lock existed only in one `LiveInvoiceService` instance. A reload could lose that lock even when the wallet had broadcast the transaction.

Added a strict version 2 browser record scoped by chain ID, contract address and ABI profile. It stores only the public hash, sending account, operation, invoice ID/approval amount, timestamp, and (for creation) the exact public create intent: payer, creator, recipients, amount, shares, expiry, and reference hash. It never stores credentials, signatures or raw transactions. After reload, the UI shows the original hash and uses read-only RPC recovery; no recovery path signs or rebroadcasts.

Recovery checks the RPC chain, transaction hash, sender, destination, decoded method and operation arguments. For `createInvoice`, decoded calldata must match the saved intent under the selected ABI profile, and the successful `InvoiceCreated` event must match payer, creator (when emitted), both recipients, amount, shares, expiry and reference hash (when emitted). A revert clears the lock only after a matching receipt is found. Successful recovery checks operation-specific evidence: invoice creation event, exact approval event, cancellation event, or for payment the paid contract state plus `InvoicePaid` and both exact USDC transfers. Missing RPC data, malformed records, mismatched transactions, or incomplete evidence remain locked and direct the user to reconcile the real explorer transaction. Browser storage failures degrade to an in-memory lock with a visible warning.

## Validation

- `npm ci` — passed; npm reported 8 moderate development dependency advisories.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test` — passed, 80 tests, including both ABI profiles, create intent calldata/event mismatch and malformed record cases, persistence after service recreation, all four operations, missing receipts/evidence, reverted tx, wallet/network/profile mismatch, corrupt/unsupported data and storage failure.
- `npm run build` — passed on Next.js 16.4.5.
- `npm run test:e2e` — passed, 4 Chromium scenarios. The e2e run checked desktop/mobile fixture and disabled-live states, including 390px horizontal-overflow assertions.
- `npm audit --omit=dev` — 0 production vulnerabilities.
- `git diff --check` — passed.
- `npm run format:check` — passed after adding the separate, non-workspace Studio Vite snapshot to `.prettierignore`; the imported files remain untouched. Sprint-edited source and docs were formatted.

The browser run captured the undeployed live view at desktop and 390px mobile widths: [desktop](2026-11-06-live-transaction-recovery/desktop-live-disabled.png) and [mobile](2026-11-06-live-transaction-recovery/mobile-live-disabled.png). Both show live writes disabled without deployment metadata; the mobile run asserted no horizontal overflow.

## Limits and remaining decisions

- `web/config/deployment.json` remains `null`; live payments are correctly disabled. No deployment, signature, transaction broadcast, or payment was performed.
- If browser storage is blocked, persistence cannot survive reload; the current service keeps the hash in memory and warns against closing the tab while unresolved.
- Corrupt recovery state or a mined success receipt missing required operation evidence fails closed. Human reconciliation through the official explorer and wallet activity is required before manual local-storage cleanup.
- A transaction absent from RPC is not automatically declared dropped; the lock remains to avoid an unsafe retry.
- Version 1 recovery records from the earlier release lack the create intent needed to verify invoice creation. They are rejected as unsupported and keep live actions blocked until the user reconciles that old hash.
- Browser local storage is editable and is not a cryptographic record of what the user intended before signing. Recovery verifies that the wallet-sent calldata and on-chain event agree with the saved intent, but cannot protect that record against same-origin script compromise or deliberate local editing.
- Studio source/profile selection, genuine Studio share URL, deployment, human contract-owner review and real payment evidence remain outstanding.

## Kishore handoff: final profile and authorized deployment preparation

Issues #1, #4 and #7 were reviewed. Issue #1 records two incompatible but independently tested sources: the preserved Arc Studio export (`studio-v1`) and Kishore's contract branch (`kishore-v1`). Issue #4 remains blocked with no deployment address/metadata; Kishore's reported deployment rehearsal was simulation only, and the throwaway deployer was unfunded. Issue #7 has authentic Studio source/export provenance but still lacks the actual judge-openable Studio project URL and original Studio chat/screenshots.

**Exact request for Kishore:**

```text
STATUS: ACTION REQUIRED — FINAL CONTRACT PROFILE DECISION / DEPLOYMENT PREPARATION
OWNER: Kishore (chain/** and docs/chain-handoff.md); Suraj (web/** and this handoff)
ISSUES: #1 (source/profile agreement), #4 (later authorized Arc Testnet deployment), #7 (Studio project URL evidence)
BRANCH: feat/live-tx-recovery-hardening-20261106 (PR #11; frontend recovery hardening only)

CONTRACT/API IMPACT: Please select exactly one source for the eventual Arc Testnet deployment: (A) the preserved Studio export as studio-v1, or (B) the reviewed Kishore implementation as kishore-v1. The signatures, payer model, expiry boundary, cancellation authority, and event fields differ; do not combine ABIs or deploy an unselected source. Record the selected source commit, exact ABI, compiler/dependency settings, constructor USDC, and any Solidity adaptations in #1. The frontend has explicit profile-specific ABIs and requires matching deployment metadata/runtime hash; no contract profile is currently activated.

TESTS: Preserved Studio source previously reproduced at 60/60 Foundry tests; Kishore source previously reproduced at 48/48. These are local contract tests, not deployed behavior. Current PR #11 CI and local frontend checks cover exact create calldata/event matching in both profiles. No deployment, wallet signature, broadcast, or payment has occurred.

BLOCKERS: #4 has no contract address, deployment receipt/hash, runtime code hash, deployment metadata or real split-payment proof. The prior throwaway deployer was reported unfunded and is not approved as a team wallet. Use an explicitly approved team-controlled Arc Testnet wallet only after source/profile review and separate deployment authorization. #7 still needs the real judge-openable Studio URL and authentic Studio chat/screenshots; the export folder suffix is not a share URL.

REQUEST: In #1, name the selected profile/source and confirm its exact deployed ABI semantics. For #4, after separate authorization, prepare and review the deployment from the approved wallet; publish the direct deployment receipt, verified runtime code hash, compiler/source/dependency metadata and explorer links, then perform the explicitly authorized small real USDC split payment and record both transfer proofs. Until then keep deployment metadata null, live writes disabled, and #1/#4/#7 open. Do not deploy as part of this PR/task.
```

## Kishore handoff: final profile and authorized deployment preparation

Issues #1, #4 and #7 were reviewed. Issue #1 records two incompatible but independently tested sources: the preserved Arc Studio export (`studio-v1`) and Kishore's contract branch (`kishore-v1`). Issue #4 remains blocked with no deployment address/metadata; Kishore's reported deployment rehearsal was simulation only, and the throwaway deployer was unfunded. Issue #7 has authentic Studio source/export provenance but still lacks the actual judge-openable Studio project URL and original Studio chat/screenshots.

**Exact request for Kishore:**

```text
STATUS: ACTION REQUIRED — FINAL CONTRACT PROFILE DECISION / DEPLOYMENT PREPARATION
OWNER: Kishore (chain/** and docs/chain-handoff.md); Suraj (web/** and this handoff)
ISSUES: #1 (source/profile agreement), #4 (later authorized Arc Testnet deployment), #7 (Studio project URL evidence)
BRANCH: feat/live-tx-recovery-hardening-20261106 (PR #11; frontend recovery hardening only)

CONTRACT/API IMPACT: Please select exactly one source for the eventual Arc Testnet deployment: (A) the preserved Studio export as studio-v1, or (B) the reviewed Kishore implementation as kishore-v1. The signatures, payer model, expiry boundary, cancellation authority, and event fields differ; do not combine ABIs or deploy an unselected source. Record the selected source commit, exact ABI, compiler/dependency settings, constructor USDC, and any Solidity adaptations in #1. The frontend has explicit profile-specific ABIs and requires matching deployment metadata/runtime hash; no contract profile is currently activated.

TESTS: Preserved Studio source previously reproduced at 60/60 Foundry tests; Kishore source previously reproduced at 48/48. These are local contract tests, not deployed behavior. Current PR #11 CI and local frontend checks cover exact create calldata/event matching in both profiles. No deployment, wallet signature, broadcast, or payment has occurred.

BLOCKERS: #4 has no contract address, deployment receipt/hash, runtime code hash, deployment metadata or real split-payment proof. The prior throwaway deployer was reported unfunded and is not approved as a team wallet. Use an explicitly approved team-controlled Arc Testnet wallet only after source/profile review and separate deployment authorization. #7 still needs the real judge-openable Studio URL and authentic Studio chat/screenshots; the export folder suffix is not a share URL.

REQUEST: In #1, name the selected profile/source and confirm its exact deployed ABI semantics. For #4, after separate authorization, prepare and review the deployment from the approved wallet; publish the direct deployment receipt, verified runtime code hash, compiler/source/dependency metadata and explorer links, then perform the explicitly authorized small real USDC split payment and record both transfer proofs. Until then keep deployment metadata null, live writes disabled, and #1/#4/#7 open. Do not deploy as part of this PR/task.
```
