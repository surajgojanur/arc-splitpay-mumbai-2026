# Submission readiness update — 2026-11-06

This update uses the same point allocation as `2026-11-06-submission-readiness.md`. It scores completed, reviewable work only. It is not a judge score, security certification, or eligibility determination.

| Area                          |     Max | Previous | Current | Evidence and reason                                                                                                                                  |
| ----------------------------- | ------: | -------: | ------: | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tested contract behavior      |      20 |       15 |      17 | Fresh chain CI passes the existing 49-test suite and proposed candidate's 64-test suite; owner approval and an independent audit remain outstanding. |
| Owner source/profile approval |      10 |        2 |       2 | Kishore review requested on draft PR #15; no approval recorded.                                                                                      |
| Studio origin evidence        |      15 |        5 |       5 | Export and ABI fingerprints are preserved; no authenticated Studio project URL or project UI proof.                                                  |
| Frontend ABI integration      |      10 |       10 |      10 | Existing explicit adapters remain; verifier adds tests for both profiles and does not enable live mode.                                              |
| Deployment readiness          |      15 |        5 |       8 | Added 12 deterministic fail-closed script tests and chain CI; actual approved source, wallet, deployment and receipt remain absent.                  |
| Genuine payment proof         |      10 |        0 |       0 | No real deployment/payment; fixture tests are not chain evidence.                                                                                    |
| Browser/mobile demo           |      10 |        9 |       9 | Five Chromium scenarios pass, including clean browser errors and mobile invoice-form bounds; screenshots are local fixture UI evidence.              |
| Documentation                 |       5 |        5 |       5 | Evidence manifest and judge-facing setup/status README added; external artifacts remain pending.                                                     |
| Video/presentation            |       5 |        0 |       0 | A truthful recording outline exists; no video or presentation artifact.                                                                              |
| **Total**                     | **100** |   **51** |  **56** | **Engineering readiness improved; Studio eligibility and real chain proof remain blocked.**                                                          |

## Remaining highest-priority work

1. Kishore reviews and explicitly approves the exact source/profile and ABI.
2. Obtain the authentic Studio project URL, chat/provenance evidence, and Studio demo capture.
3. After separate authorization, deploy the approved source and record its genuine receipt/runtime metadata.
4. After separate payment authorization, execute and verify one real split, preserving the invoice, approval, settlement and two transfer-event hashes.
5. Record the final under-three-minute demo and presentation, then re-evaluate eligibility against the [official rules](https://ethglobal.com/events/mumbai/prizes/arc).
