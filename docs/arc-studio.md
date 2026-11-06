# Arc Studio provenance — export available, share URL pending

Studio project/share URL: **NOT RECORDED**. Export identifier: `arcsplit_usdc_invoice_distribution_4zjjiq` (suffix `4zjjiq` is not a share URL).

On 2026-11-06 the user supplied a project downloaded through the Fedora browser. Found the already extracted folder at `/home/god/Documents/github/arc-splitpay-mumbai-2026/arcsplit_usdc_invoice_distribution_4zjjiq`. Actual Studio contract, Solidity interface, ABI, Vite/React dashboard, Foundry tests, architecture documents and handoff package are present. Generation/export has succeeded; the previous unavailable-browser-host blocker is historical. The original checkout/download is untouched.

Selected originals are preserved byte-for-byte in [studio-original](studio-original/), with SHA256 inventory. Full export inventory and a [comparison](studio-comparison.md) distinguish the local Next.js scaffold, independent Kishore contract and Studio source. Credentials, `.env`, logs, compiled artifacts and unrelated helpers are excluded. Nested handoff ZIP is corrupt (`Bad magic number for central directory`) and was rejected without extraction; the tar.gz is not valid gzip. Textual extracted sources and handoff SHA256 manifest are available.

Fresh clean build using Foundry 1.7.1, solc 0.8.28 and OpenZeppelin 5.6.1 passed. `forge test -vv`: **60 passed, 0 failed, 0 skipped** including both full default invariant tests. Fresh compiled ABI matches both Studio ABI exports exactly. This is test evidence, not an independent security audit. No contract deployment or actual USDC payment has occurred.

## Required seed request

Build ArcSplit, a minimal mobile-friendly USDC invoice settlement app on Arc Testnet. A payer creates an invoice containing two payout recipients, a total USDC amount, a percentage split in basis points, and an expiry. The payer can approve and pay once. The contract atomically distributes USDC to both recipients, rejects duplicate settlement, and emits payment events. Provide a real wallet-connected frontend, a working smart contract, testnet deployment support, and readable transaction history. Keep the interface simple, original, and clearly focused on programmable payment splitting. Use official Arc Testnet USDC and show a complete testnet payment.

The above is the requested seed from our project brief, not a verified transcript of Studio's original chat. Preserve the real first prompt/chat and project screenshots when accessing Studio.

Remaining provenance steps: copy the actual judge-openable Studio project URL, preserve original chat and Studio screenshots, reconcile source/profile with Kishore in #1/#2, and demonstrate the final integrated contract/app inside Studio. A hosted frontend URL does not satisfy the project URL requirement.

Official prize: https://ethglobal.com/events/mumbai/prizes/arc
