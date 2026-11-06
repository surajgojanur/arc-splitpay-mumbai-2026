# Demo and submission checklist

Run `npm ci`, `npm run dev` and open http://localhost:3000. Fixture views are conspicuously marked DEMO DATA. The Live payments tab is separate and disabled without verified deployment metadata. Connect an injected EVM wallet for network/balance inspection, or use the explicit fixture wallet. Create a 100 USDC, 70/30 invoice, review payouts, simulate approval and settlement and inspect the fixture receipt. No simulated transaction is payment proof.

## Video script (recording pending)

1. Show the actual Arc Studio project and original generation (share URL and recording pending; downloaded source is now preserved).
2. Explain: one invoice pays two contributors, once.
3. Connect Arc Testnet payer, enter recipients and 100 USDC with 70/30 split.
4. Show required allowance approval and real settlement signatures.
5. Open explorer transaction and recipient transfer logs; show 70 and 30 USDC received.
6. Show duplicate, wrong payer, expiry and cancellation rejection; show architecture and GitHub.

## Completion

- [x] Public GitHub repository and frontend scaffold
- [x] Architecture diagram and AI disclosure
- [x] Studio-generated source export preserved
- [ ] Shareable Studio project URL and original chat/screenshots
- [ ] Kishore confirms final deployed source/profile
- [x] Both independent contract test suites reproduced
- [ ] Contract deployment and verification
- [x] Live ABI adapter code and regression tests
- [ ] Complete genuine testnet payment
- [ ] Recipient receipt proof and explorer links
- [ ] Final Studio demonstration
- [ ] Demo video and presentation

Chosen bounty: **Best Smart Contracts with Advanced Stablecoin Logic, In Arc Studio**. Not submission-ready; eligibility is not claimed.

## Original fixture milestone evidence — 2026-11-06

Passed locally with Node v22.23.1: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test` (17 tests), `npm run build`, and `npm run test:e2e` (3 Playwright Chromium tests). Browser coverage includes disconnected wallet, invalid form, exact 70/30 preview, approval rejection/retry, pending settlement, failed settlement/retry, fixture receipt, lookup failure, cancellation, wrong network and rejected network switching. Mobile checks use 390 × 844 and assert no horizontal overflow.

Screenshots in `web/public/screenshots/`: landing.png, wallet-disconnected.png, invoice-form.png, validation-errors.png, invoice-preview.png, payment-pending.png, receipt.png, mobile-landing.png, mobile-receipt.png. All are fixture evidence only. Desktop landing, payout preview and mobile receipt were visually inspected.

`npm audit --omit=dev` found zero production vulnerabilities. Full `npm audit` reports 8 moderate findings in the development lint dependency chain through minimatch; unresolved, no forced major downgrade applied. These are not evidence of contract security. No actual wallet USDC payment or recipient receipt has been verified.

## Studio integration validation — 2026-11-06

The measurements below are historical validation of the initial Studio export and frontend integration. The current proposed Studio-derived candidate and final browser additions are recorded separately in the [submission readiness update](reviews/2026-11-06-submission-readiness-update.md) and [evidence manifest](submission/evidence-manifest.md).

The downloaded Studio export is now available and preserved. Its shareable project URL is still missing. Separate independent contracts exist: Studio source (`docs/studio-original/`) and Kishore PR #9 (`a3ac1b7`); neither is deployed. Contract-owner source/profile selection and actual payment evidence remain mandatory.

Fresh local Foundry 1.7.1 results in isolated temporary copies:

- Studio: `forge clean`, `forge build`, `forge test -vv`: **60 passed / 0 failed / 0 skipped**, including both full default invariant runs (146 seconds). Solc 0.8.28, OpenZeppelin 5.6.1, exported forge-std. Fresh ABI exactly equals exported Studio and handoff ABI; handoff SHA256 manifest passes.
- Kishore: `npm ci`, `forge build`, `forge test -vv`: **48 passed / 0 failed / 0 skipped**. Published ABI equals freshly compiled ABI. No change to his branch/files.

Latest proposed-work CI: Kishore chain suite **49/49**, Studio-derived candidate **64/64**, deployment safety **12/12**, and compiled candidate ABI matches the preserved Studio ABI. Frontend is now **115/115 unit tests** and **5/5 Chromium scenarios** (including mobile form bounds and no console/page errors). See [chain PR checks](https://github.com/surajgojanur/arc-splitpay-mumbai-2026/pull/15) and [web PR checks](https://github.com/surajgojanur/arc-splitpay-mumbai-2026/pull/14). Candidate source still requires Kishore review.

Frontend: clean install, TypeScript, lint, **59 unit tests**, production build and **4 Chromium scenarios** passed locally. Unit tests cover profile ABI/configuration validation, 6-decimal conversions and payouts, RPC/bytecode/token/receipt gates, network/account mismatch, wallet rejection, balance/allowance, expiry/cancellation/duplicate guards, exact approvals, confirmed create/pay/cancel, decoded events and both transfers, simulation failure, timeout hash preservation/recovery and amount limits. The metadata CLI was tested with synthetic metadata only in a separate scratch directory; real config remains null.

An initial browser attempt reused an old port-3000 server and could not find the new tab. Tests now start their own server on port 3107 with reuse disabled. One screenshot-heavy scenario exceeded the prior 30-second total during a busy run; its total budget is now 90 seconds with the same assertions, and the full rerun passed in 12.4 seconds. No other user's server was stopped.

New screenshots: `web/public/screenshots/integration/` contains the nine fixture captures plus desktop/mobile undeployed live view. All nine original screenshot files remain unchanged. Mobile viewport 390 × 844 has no horizontal overflow. Live undeployed mobile layout was visually inspected. Service tests use synthetic transports/logs and are not evidence of a real chain payment.

Updated submission gates:

- [x] Actual Studio export source and architecture preserved with hashes
- [x] Both Solidity suites independently reproduced
- [x] Explicit live ABI adapters and guarded frontend implemented
- [ ] Kishore source/profile decision and review approval
- [ ] Dedicated approved team-wallet deployment (not authorized in this task)
- [ ] Genuine Arc Testnet split and receipt/balance proof
- [ ] Judge-openable Studio project/share URL, original chat/screenshots
- [ ] Final Studio demonstration, video and presentation
