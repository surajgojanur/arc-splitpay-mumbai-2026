# Demo and submission checklist

Run `npm ci`, `npm run dev` and open http://localhost:3000. The current app is conspicuously marked DEMO DATA. Connect an injected EVM wallet for network/balance inspection, or use the explicit fixture wallet. Create a 100 USDC, 70/30 invoice, review payouts, simulate approval and settlement and inspect the fixture receipt. No simulated transaction is payment proof.

## Video script (recording pending)

1. Show Arc Studio project and original generation (blocked).
2. Explain: one invoice pays two contributors, once.
3. Connect Arc Testnet payer, enter recipients and 100 USDC with 70/30 split.
4. Show required allowance approval and real settlement signatures.
5. Open explorer transaction and recipient transfer logs; show 70 and 30 USDC received.
6. Show duplicate, wrong payer, expiry and cancellation rejection; show architecture and GitHub.

## Completion

- [x] Public GitHub repository and frontend scaffold
- [x] Architecture diagram and AI disclosure
- [ ] Real Arc Studio starting point and shareable URL
- [ ] Kishore confirms shared interface
- [ ] Contract tests, deployment and verification
- [ ] Live ABI integration and complete testnet payment
- [ ] Recipient receipt proof and explorer links
- [ ] Final Studio demonstration
- [ ] Demo video and presentation

Chosen bounty: **Best Smart Contracts with Advanced Stablecoin Logic, In Arc Studio**. Not submission-ready; eligibility is not claimed.

## Frontend validation evidence — 2026-11-06

Passed locally with Node v22.23.1: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test` (17 tests), `npm run build`, and `npm run test:e2e` (3 Playwright Chromium tests). Browser coverage includes disconnected wallet, invalid form, exact 70/30 preview, approval rejection/retry, pending settlement, failed settlement/retry, fixture receipt, lookup failure, cancellation, wrong network and rejected network switching. Mobile checks use 390 × 844 and assert no horizontal overflow.

Screenshots in `web/public/screenshots/`: landing.png, wallet-disconnected.png, invoice-form.png, validation-errors.png, invoice-preview.png, payment-pending.png, receipt.png, mobile-landing.png, mobile-receipt.png. All are fixture evidence only. Desktop landing, payout preview and mobile receipt were visually inspected.

`npm audit --omit=dev` found zero production vulnerabilities. Full `npm audit` reports 8 moderate findings in the development lint dependency chain through minimatch; unresolved, no forced major downgrade applied. These are not evidence of contract security. No actual wallet USDC payment or recipient receipt has been verified.
