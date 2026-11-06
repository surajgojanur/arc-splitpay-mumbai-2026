# Open issue readiness — 2026-11-07

This review separates tested implementation from the external evidence required
to close each issue. Passing fixture tests does not establish live settlement or
Studio provenance. No issue is closed by this change.

| Issue                     | Implementation available                                                                                                    | Remaining acceptance requirement                                                                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1 Architecture and ABI   | Exact separate Studio/Kishore profiles, pinned Studio proposal, ABI comparison                                              | Both owners must acknowledge the final source/profile in the issue. The proposed Studio source is not deployment authorization.                                                                                                          |
| #2 Contract and ABI       | Contract guards, exact split arithmetic, hostile-token tests, exported ABIs                                                 | Final source/profile acknowledgement and review of the selected implementation.                                                                                                                                                          |
| #3 Frontend               | Wallet connection, validation, fixture/live separation, lookup, cancellation, receipt and recovery flows                    | Maintainer review of validated frontend evidence. Real writes belong to #5 and stay disabled without verified deployment metadata.                                                                                                       |
| #4 Arc Testnet deployment | Deployment gates, receipt checks, exact balance arithmetic, transaction-bound invoice ID, duplicate-settlement verification | Approved source/profile and team wallet; deployment; verified contract and real payment/payout receipts. Current action script supports only `kishore-v1`; selecting Studio also requires its deployment path to be reviewed before use. |
| #5 Browser integration    | Explicit ABI adapters, configuration verification, exact transfer-log verifier, desktop/mobile browser tests                | Real approved deployment and authorized wallet actions; creation, approval, settlement and both transfer logs; live rejection/recovery evidence.                                                                                         |
| #6 Submission             | Architecture, source inventory, screenshots, demo outline, AI disclosure and evidence checklist                             | Actual Studio URL/session evidence, final deployment/payment proof, recorded video/presentation and team submission details.                                                                                                             |
| #7 Studio provenance      | Original exported source and fingerprints preserved                                                                         | Original judge-openable Studio share URL, prompt/chat and authentic Studio screenshots/demo. Export suffix `4zjjiq` is not a share URL.                                                                                                  |

## Fixes in this change

- Match transaction summaries to receipts by hash rather than array position.
  Reject missing, duplicate or failed receipts before printing a success summary;
  preserve exact gas values with bigint arithmetic.
- Reject malformed recipient balances before attempting payment and propagate
  invoice lookup failures instead of allowing `echo` to mask them.
- Reject unsafe numeric deployment blocks during frontend metadata preparation
  and payment verification. Exact decimal strings remain supported.
- Match the deployment receipt's transaction hash and reject payments reported
  before deployment.

## Validation record

All validation below passed before opening the pull request (Node 22,
Foundry 1.9.0):

| Check                                                               | Result                                                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Independent contract, `cd chain && forge test -vv`                  | 51 passed                                                                                                          |
| Studio candidate, `cd chain/studio-candidate && forge test -vv`     | 62 unit/fuzz tests and both invariants passed; this Foundry version groups the invariant suite, reporting 63 total |
| Script safety, `node --test chain/script/live-arc-testnet.test.mjs` | 24 passed                                                                                                          |
| Frontend, `npm test`                                                | 117 passed                                                                                                         |
| Browser, `npm run test:e2e`                                         | 5 Chromium scenarios passed, including desktop/mobile validation and missing-deployment gates                      |
| `npm run typecheck` and `npm run lint`                              | Passed                                                                                                             |
| `npm run build -w web -- --webpack`                                 | Production build passed                                                                                            |
| `node chain/script/check-studio-abi.mjs`                            | Compiled ABI, preserved ABI and pinned source/build inputs match                                                   |
| `npm run format:check`, Bash syntax, `git diff --check`             | Passed                                                                                                             |

The default Turbopack production builder could not start its worker because this
environment denied its local port binding. The supported Webpack production
builder passed instead; default-builder success is not claimed.
Browser and transport scenarios use fixtures; no wallet was read, transaction
signed, deployment configuration activated or live payment performed.

External inputs requested from the team: final contract choice, approved wallet
and deployment details, and the authentic Studio project URL. Until these arrive,
the live evidence and provenance requirements above remain incomplete.
