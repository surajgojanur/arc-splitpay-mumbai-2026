# Contract selection review — ArcSplit

**Review status:** proposed engineering recommendation only. Kishore has not approved a deployment source. No deployment, signature or token transfer occurred.

## Evidence examined

- Repository baseline: `origin/main` at `9d38ff6c4e6e05fc77df0b6f6f45626e8798cd07`.
- Kishore source: `chain/src/ArcSplit.sol`, last source commit `60a0fc9`; current checked-in ABI: `chain/abi/ArcSplit.json`.
- Studio source: `docs/studio-original/contracts/ArcSplit.sol`; byte-identical handoff source SHA-256 `b7c3e7de35dc74271b0e39e5e1acc26d889f8a93714d45277c3231c6e2098d24`; Studio ABI SHA-256 `1c1d603aa96a6e025664926e4604319146b0f40d8eee0ef5a0732ed2e6b6de60`.
- Reproduced Studio suite from an isolated copy using solc 0.8.28, OpenZeppelin 5.6.1 and forge-std 1.17.0: 60 passed, 0 failed (including 2 invariant suites).
- Reproduced Kishore suite using solc 0.8.28, OpenZeppelin 5.1.0 and forge-std 1.9.4: 48 passed, 0 failed. The proposed self-recipient guard adds a regression test; the modified branch then passes 49/49. No exported ABI changes.
- The Arc Testnet deployment script on the Studio handoff source checks chain ID, official USDC code and 6 decimals before deployment. The Kishore constructor checks token code and 6 decimals; its deploy script additionally fixes the official Arc Testnet USDC address.

## Contract comparison

| Area                 | `studio-v1`                                                                                           | `kishore-v1`                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Payer                | Explicit payer; payer may be a recipient                                                              | Creator is payer                                                                                                                |
| Amount/shares        | `uint128`, two `uint16` shares summing to 10,000                                                      | `uint256`, one A share; B receives remainder                                                                                    |
| Settlement           | `settleInvoice`                                                                                       | `payInvoice`                                                                                                                    |
| Expiry               | Valid through the expiry second (`now > expiry` rejects)                                              | Valid strictly before expiry (`now >= expiry` rejects)                                                                          |
| Cancellation         | Creator or payer                                                                                      | Payer only                                                                                                                      |
| State/events         | Struct read, creation includes creator and reference hash                                             | Flat read, simpler payer-indexed events                                                                                         |
| Token check          | Constructor requires token code; official deploy script also checks Arc chain, address and 6 decimals | Constructor requires token code and 6 decimals; deploy script fixes official token                                              |
| Reentrancy/atomicity | No explicit guard; writes Paid before SafeERC20 transfers, with transaction rollback on failure       | OpenZeppelin `ReentrancyGuard`, effects before SafeERC20 transfers, rollback on failure                                         |
| Recipient validation | Rejects zero, duplicate and the contract address                                                      | Baseline rejected zero and duplicate, but not the contract address; proposed branch now rejects self-recipient                  |
| Tests                | 60 tests, including blocklist, atomic rollback, invariants and exact expiry behavior                  | 48 baseline tests, including hostile tokens, reentrancy, rollback and fuzzing; proposed regression adds self-recipient coverage |
| Frontend profile     | Exact ABI adapter and tests exist                                                                     | Exact ABI adapter and tests exist                                                                                               |
| Provenance           | Preserved Studio export and hash inventory; judge-openable Studio URL/chat/screenshots still missing  | Independent Foundry implementation, not Studio-originated                                                                       |

Both implementations use SafeERC20, exact integer arithmetic, remainder-to-B payouts, terminal paid/cancelled status and direct payer-to-recipient transfers. Neither has an independent professional audit. Reentrancy resistance in Studio is based on checks-effects-interactions and transaction atomicity; the absence of an explicit guard is a defense-in-depth difference, not a demonstrated exploit against the configured official USDC.

## Evidence-based score

These are engineering-readiness points for the requested categories, not a security certification or prize prediction.

| Category                            |     Max | `studio-v1` | `kishore-v1` | Evidence behind score                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ------: | ----------: | -----------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Functional correctness              |      25 |          23 |           23 | Both reproduce broad deterministic and invariant coverage; profile-specific expiry, payer, cancellation and ABI behavior are internally consistent. Neither includes recipient consent, by design.                                                                                                                                                   |
| Security                            |      25 |          20 |           20 | Both use SafeERC20 and CEI/atomic rollback. Studio lacks an explicit guard but passes adversarial tests; it relies on the deployment script for official token/decimal checks. Kishore adds guard and constructor decimals check, but had a confirmed self-recipient funds-locking gap; proposed fix is not approved. Neither independently audited. |
| Frontend compatibility              |      15 |          15 |           15 | Explicit exact ABI snapshots and profile-specific service paths exist for each; deployment remains disabled without metadata.                                                                                                                                                                                                                        |
| Arc Studio provenance / sponsor fit |      20 |          15 |            1 | Studio export is preserved with hashes and tests, but the official prize requires Studio as starting point, a judge-openable project URL, and Studio shown in demo; URL and original UI/chat evidence are missing. Kishore contract is independently implemented.                                                                                    |
| Deployment reproducibility          |      10 |           7 |            8 | Both pin solc and build settings. Kishore has npm lock and receipt-based metadata writer; Studio handoff has pinned git dependency tags but no lockfile in the exported app. Neither has approval or an actual deployment.                                                                                                                           |
| Demo readiness                      |       5 |           3 |            3 | Fixture/browser demo is reproducible; no live deployment or payment proof exists.                                                                                                                                                                                                                                                                    |
| **Total**                           | **100** |      **83** |       **70** | Both remain blocked on profile approval and deployment evidence.                                                                                                                                                                                                                                                                                     |

## Recommendation

**Recommend option C: a Studio-derived contract-owner adaptation with the Studio external ABI preserved, subject to Kishore's review and explicit source selection.** Use the preserved Studio source hash above as the starting point. Keep `studio-v1` signatures and event fields so the existing frontend profile remains exact. Before any deployment, Kishore should make a reviewed change that retains the tested state/expiry behavior, validates the official token address and six-decimal interface at the contract boundary (not only in a script), and explicitly retain or add the tested reentrancy defense. Run the complete Studio suite against that final exact source and compare its compiled ABI to the Studio snapshot. Any source change makes the profile source a reviewed adaptation rather than an unchanged Studio export; disclose that accurately.

This recommendation is not approval. It prioritizes the requested Arc Studio smart-contract bounty while closing deployment-time token assumptions. The current official wording says each Arc prize requires Arc Studio as the starting point, and this bounty asks teams to write, test and deploy contracts in Studio and connect an app without leaving Studio. It also expressly requires a judge-openable Studio URL and Studio shown in the demo. The project has preserved source evidence but is **not presently demonstrably eligible** without those missing items. Recheck the official rules at submission time: <https://ethglobal.com/events/mumbai/prizes/arc>.

Kishore must approve (1) the source choice, (2) any adaptation, (3) exact profile/ABI semantics, (4) the reviewed build/runtime hash, and (5) the team-controlled wallet/deployment plan. Suraj's frontend already supports the exact `studio-v1` ABI; no deployment metadata is active. Reproduction is locally possible with the pinned toolchains, but deployment is not currently authorized or reproducible from an approved source/wallet.

**Important deployment-tool scope:** the proposed preflight and gated broadcast script in this branch currently build and accept `kishore-v1` only. If Kishore selects the recommended Studio-derived adaptation, its source, pinned dependency set, `Deploy.s.sol`, ABI export, metadata writer and profile gate must first be changed and revalidated together against that exact source. The profile JSON is a process guard requiring an explicit `approved: true`, profile and exact source commit; it is not a cryptographic proof of Kishore's identity or a substitute for a recorded owner review and separate deployment authorization.

## Verified finding

- **MEDIUM — corrected as a proposed patch:** Kishore's baseline accepted `address(this)` for either recipient. Paying such an invoice could transfer USDC into ArcSplit, which has no withdrawal path and is documented as non-custodial. The separate `feat/chain-deployment-readiness-20261106` proposal rejects self-recipient values with the existing `InvalidRecipient` error and tests both positions. This is not merged or owner-approved.

## Deployment gate snapshot

| Check                            | Status  | Evidence / next action                                                                                            |
| -------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| Arc Testnet chain                | PASS    | Official docs list chain ID 5042002 and `https://rpc.testnet.arc.io`.                                             |
| ERC-20 USDC                      | PASS    | Official docs list `0x3600000000000000000000000000000000000000`, six ERC-20 decimals; native gas precision is 18. |
| Compiler/build/test              | PASS    | Fresh local builds and suites above.                                                                              |
| Compiled ABI                     | PASS    | The proposed recipient guard does not change signatures; separately compare compiled ABI before release.          |
| Source/profile selection         | BLOCKED | No owner approval/selection record in issue #1.                                                                   |
| Deployment metadata and receipt  | BLOCKED | No deployment artifact/address/receipt.                                                                           |
| Runtime code/source verification | BLOCKED | Requires approved exact source, build, receipt and code hash after authorized deployment.                         |
| Wallet/recipient readiness       | NOT RUN | No secrets were read and no wallet values were checked.                                                           |
| Human deployment authorization   | BLOCKED | Must be granted separately; no deployment is authorized here.                                                     |
| Real payment and payout proof    | BLOCKED | No real Arc Testnet payment has occurred.                                                                         |
