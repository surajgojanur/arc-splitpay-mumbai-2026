# Sprint handoff: reload-safe live transaction recovery

## Checkpoint

- Starting `origin/main`: `9d38ff6c4e6e05fc77df0b6f6f45626e8798cd07`.
- Feature branch: `feat/live-tx-recovery-hardening-20261106`.
- PR #10 remained open as a draft at `https://github.com/surajgojanur/arc-splitpay-mumbai-2026/pull/10`; its integration commits were already ancestors of `main`. The latest observed PR checks passed. No PR state or issue state was changed.
- Repository-specific ownership rules were reviewed. No files under `chain/**`, `docs/chain-handoff.md`, or immutable `docs/studio-original/**` were edited.

## Baseline and implementation

Baseline on the clean worktree after `npm ci`: `npm run typecheck`, `npm run lint`, and `npm test` passed (59 tests). The main reliability defect was that a transaction hash and retry lock existed only in one `LiveInvoiceService` instance. A reload could lose that lock even when the wallet had broadcast the transaction.

Added a strict version 1 browser record scoped by chain ID, contract address and ABI profile. It stores only the public hash, sending account, operation, invoice ID/approval amount and timestamp. It never stores credentials, signatures or raw transactions. After reload, the UI shows the original hash and uses read-only RPC recovery; no recovery path signs or rebroadcasts.

Recovery checks the RPC chain, transaction hash, sender, destination, decoded method and operation arguments. A revert clears the lock only after a matching receipt is found. Successful recovery checks operation-specific evidence: invoice creation event, exact approval event, cancellation event, or for payment the paid contract state plus `InvoicePaid` and both exact USDC transfers. Missing RPC data, malformed records, mismatched transactions, or incomplete evidence remain locked and direct the user to reconcile the real explorer transaction. Browser storage failures degrade to an in-memory lock with a visible warning.

## Validation

- `npm ci` — passed; npm reported 8 moderate development dependency advisories.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test` — passed, 73 tests, including both ABI profiles, persistence after service recreation, all four operations, missing receipts/evidence, reverted tx, wallet mismatch, corrupt/unsupported data and storage failure.
- `npm run build` — passed on Next.js 16.4.5.
- `ARCSPLIT_SCREENSHOT_DIR=/tmp/arcsplit-sprint-browser-evidence-final npm run test:e2e` — passed, 4 Chromium scenarios. Existing screenshots were not overwritten; the e2e run checked desktop/mobile fixture and disabled-live states, including 390px horizontal-overflow assertions.
- `npm audit --omit=dev` — 0 production vulnerabilities.
- `git diff --check` — passed.
- `npm run format:check` — passed after adding the separate, non-workspace Studio Vite snapshot to `.prettierignore`; the imported files remain untouched. Sprint-edited source and docs were formatted.

The browser run captured the undeployed live view at desktop and 390px mobile widths: [desktop](2026-11-06-live-transaction-recovery/desktop-live-disabled.png) and [mobile](2026-11-06-live-transaction-recovery/mobile-live-disabled.png). Both show live writes disabled without deployment metadata; the mobile run asserted no horizontal overflow.

## Limits and remaining decisions

- `web/config/deployment.json` remains `null`; live payments are correctly disabled. No deployment, signature, transaction broadcast, or payment was performed.
- If browser storage is blocked, persistence cannot survive reload; the current service keeps the hash in memory and warns against closing the tab while unresolved.
- Corrupt recovery state or a mined success receipt missing required operation evidence fails closed. Human reconciliation through the official explorer and wallet activity is required before manual local-storage cleanup.
- A transaction absent from RPC is not automatically declared dropped; the lock remains to avoid an unsafe retry.
- Studio source/profile selection, genuine Studio share URL, deployment, human contract-owner review and real payment evidence remain outstanding.
