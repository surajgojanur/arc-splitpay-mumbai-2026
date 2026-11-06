# Studio-derived candidate readiness (proposed)

**Status: prepared for Kishore's review; not approved for deployment.** This candidate is an isolated copy/adaptation. It does not replace `chain/src/ArcSplit.sol`, and the preserved Studio export remains unchanged.

## Provenance and fingerprints

- Baseline: `docs/studio-original/contracts/ArcSplit.sol`, SHA-256 `b7c3e7de35dc74271b0e39e5e1acc26d889f8a93714d45277c3231c6e2098d24`.
- Baseline ABI: `docs/studio-original/docs/handoff/ArcSplit.abi.json`, SHA-256 `1c1d603aa96a6e025664926e4604319146b0f40d8eee0ef5a0732ed2e6b6de60`.
- Candidate source: `chain/studio-candidate/src/ArcSplit.sol`, SHA-256 `b2153300ac74afac853d03916a1b867a6ce2223922d5bc21ca5faeaccff6e474` (recompute after edits).
- Candidate ABI: `chain/studio-candidate/abi/ArcSplit.studio-v1.json`; JSON comparison against the preserved ABI passes (29 entries, exact structure).
- Compiler: Solidity `0.8.28`, Cancun EVM, optimizer enabled, 200 runs.
- Dependencies: OpenZeppelin Contracts `5.6.1`; `forge-std` `v1.17.0` pinned to commit `f3dae6e6ee381f25eb6a246f7da9b85c91a68219` in the lockfile.

## Adaptations

The candidate requires the official Arc Testnet USDC address and verifies six decimals during construction. It preserves the Studio ABI by keeping the chain-specific constant private and using an empty revert for the reentrancy guard. It rejects the contract itself as payer/recipient, retains distinct positive recipients and positive payouts, and uses `SafeERC20` so failed transfers revert the full transaction. The original Studio files were not edited.

## Validation and limits

- ABI identity: PASS with `node chain/script/check-studio-abi.mjs`.
- Candidate `forge build` / `forge test`: NOT RUN in this session; `forge` is unavailable in the current environment. A CI workflow now runs both the existing Kishore suite and candidate suite with Foundry `v1.7.1`.
- No deployment, signing, RPC write, or payment was performed.
- Exact source/dependency/compiler reproducibility and security remain subject to fresh CI and Kishore review. Exact ABI equality does not prove bytecode equivalence or Studio deployment provenance.

## Review decision requested

Kishore should review the source changes, compiler/dependency pins, token constructor restriction, payout/expiry/cancellation semantics, and Foundry CI results, then explicitly approve or request changes. Until that review and actual Studio provenance/deployment are available, this is only a proposed candidate.
