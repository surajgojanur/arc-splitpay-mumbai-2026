# Frontend integration requirements (for Suraj)

Reference only. This folder is **not** part of the `chain/**` import and nothing here changes `web/**`. Read `chain/docs/INTEGRATION_CONTRACT.md` first; it is the exact contract.

## Wait for the interface decision

Kishore must settle the interface question in `docs/chain-handoff.md` before you write the live adapter. The repo's `docs/architecture.md` proposes `payInvoice` and a payer-is-`msg.sender` create; ArcSplit as generated uses `settleInvoice` and an explicit payer. Do not code against either until the issue records the decision.

## Inputs you consume read-only

| Artifact | Path | Status |
| --- | --- | --- |
| ABI | `chain/abi/ArcSplit.json` | Available |
| Deployment record | `chain/deployments/arc-testnet.json` | **Does not exist until Kishore deploys.** Only a template exists |
| Env | `NEXT_PUBLIC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_DEPLOYMENT_BLOCK` (names already in `.env.example`) | Leave empty until a real deployment exists |

## Checks before enabling live writes (keep fixtures separate)

1. Wallet chain id equals `5042002`; offer a switch action otherwise.
2. `eth_getCode(NEXT_PUBLIC_CONTRACT_ADDRESS)` is non-empty.
3. `ArcSplit.usdc()` equals `0x3600000000000000000000000000000000000000` and the token's `decimals()` is `6`.
4. Never mix units: amounts are 6-decimal ERC-20 base units; the native gas balance is 18 decimals. Parse user input with exact decimal string arithmetic, never floating point.
5. Show creator, payer, both recipients and both payouts before the approve/pay step (anyone can create an invoice naming a payer).
6. Fixtures stay in memory and must never produce a chain hash, explorer link or "paid" badge. Only render receipts from a mined transaction receipt or decoded `InvoicePaid` log.

## Calls and reads

```ts
createInvoice(payer, recipientA, recipientB, amount /*6dp bigint*/, bpsA, bpsB, expiry /*unix s*/, referenceHash /*0x00..00 if unused*/)
USDC.approve(ArcSplit, amount)       // payer
settleInvoice(id)                    // payer only
cancelInvoice(id)                    // creator or payer
getInvoice(id), isExpired(id), payoutsOf(id), nextInvoiceId()
```

- Status `1` Open, `2` Paid, `3` Cancelled; show "Expired" when Open and `isExpired(id)`.
- Read the new invoice id from the `InvoiceCreated` log in the create receipt.
- The settlement hash is the `transactionHash` of the `InvoicePaid` log (filter by indexed `id`). Start log scans at `NEXT_PUBLIC_DEPLOYMENT_BLOCK`, never block 0.
- Map custom errors (names in `INTEGRATION_CONTRACT.md`) to user messages; treat wallet rejection as cancellation, not failure.
- Expiry: pick the offset from the latest block timestamp where possible; the Studio demo uses the browser clock.

## Working reference implementation

The Arc Studio project contains a complete Vite/React/wagmi implementation of this flow you can read and port. It was written for Vite, so adapt imports and the provider setup for Next.js (`"use client"` components, `NEXT_PUBLIC_` env names):

| Concern | File in the Studio project |
| --- | --- |
| Address/chain config, status enum | `src/contracts/arcSplit.ts` |
| Typed ABI | `src/contracts/arcSplitAbi.ts` |
| Transaction lifecycle (wallet, confirming, rejected, failed) | `src/hooks/useTx.ts` |
| Invoice, allowance, balance, log reads | `src/hooks/useInvoice.ts` |
| Error mapping | `src/lib/errors.ts` |
| Split preview math (mirrors the contract) | `src/lib/split.ts` |
| UI | `src/components/*` |

## Files you own that need follow-up after the decision

- `docs/architecture.md`: reconcile the "proposed interface" section with the accepted interface.
- `docs/arc-studio.md`: replace the BLOCKED text using `for-suraj/arc-studio-provenance.md`.
- `.env.example`: unchanged (names already match).
