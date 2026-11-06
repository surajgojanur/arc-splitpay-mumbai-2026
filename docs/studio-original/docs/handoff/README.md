# ArcSplit handoff for review

Nothing here has been pushed to `surajgojanur/arc-splitpay-mumbai-2026`. Review these files, then copy what you want by hand or open a pull request yourselves.

> The complete, verified import package for the team repo is `handoff-package/` (archives: `arcsplit-handoff.tar.gz`, `arcsplit-handoff.zip`). Start with `handoff-package/docs/chain-handoff.md`. This file is the earlier summary.

## Status

| Item | State |
| --- | --- |
| `ArcSplit.sol` | Written, compiled, 60 Foundry tests passing, two independent reviews with no material findings |
| Arc Testnet deployment | **Not deployed.** Waiting for an explicitly authorized deployment wallet (see below) |
| Contract address | None yet. Do not use any address in the frontend until one is recorded here |
| Web app | Working against any deployed address via `VITE_ARCSPLIT_ADDRESS`; shows an honest "not deployed" state until set |

When a deployment exists, record it here:

```
Network:        Arc Testnet (5042002)
ArcSplit:       <address>
Deploy tx:      <hash>
Deploy block:   <block>
USDC:           0x3600000000000000000000000000000000000000
Deployed by:    <wallet>
```

## Files to review

| File | For | Purpose |
| --- | --- | --- |
| `contracts/ArcSplit.sol` | Kishore | Contract |
| `contracts/interfaces/IArcSplit.sol` | Both | Solidity interface for integrators |
| `contracts/test/ArcSplit.t.sol` | Kishore | Tests |
| `docs/handoff/ArcSplit.abi.json` | Suraj | ABI for viem/wagmi/ethers |
| `src/contracts/arcSplitAbi.ts` | Suraj | Same ABI as a typed `as const` export |
| `docs/architecture.md` | Both | Diagrams and rules |

## Kishore: contract and deployment

Constructor takes one argument: the USDC ERC-20 address. On Arc Testnet that is `0x3600000000000000000000000000000000000000` (6 decimals), listed in the Arc docs under Contract addresses > USDC > Testnet.

```bash
forge build
forge test                       # 60 tests

# Deploy from your own wallet (testnet only). Prefer an encrypted keystore over a raw key flag.
forge create contracts/ArcSplit.sol:ArcSplit \
  --rpc-url https://rpc.testnet.arc.io \
  --account <your-keystore-name> \
  --broadcast \
  --constructor-args 0x3600000000000000000000000000000000000000
```

Arc has a USDC blocklist and other runtime differences from Ethereum. Run `arc-anvil --network arc` fork tests before any wider rollout. Tools such as plain `anvil` do not reproduce Arc behavior.

Design notes worth reviewing:
- Recipient B takes the rounding remainder; recipient A is floored.
- Either share rounding to 0 base units is rejected at creation.
- A USDC-blocklisted payer or recipient makes settlement revert atomically; the payer or creator can then cancel.
- Expiry is inclusive (settling at `block.timestamp == expiry` works).

## Suraj: frontend integration

Environment variables (Next.js names; this project uses the `VITE_` equivalents):

```
NEXT_PUBLIC_ARCSPLIT_ADDRESS=<deployed address>
NEXT_PUBLIC_ARCSPLIT_DEPLOY_BLOCK=<deploy block>   # bounds the receipt log lookup
```

Minimal wagmi usage:

```ts
import { erc20Abi } from 'viem'
import abi from './ArcSplit.abi.json'

// 1. create (any wallet; msg.sender is stored as creator)
writeContract({ address: ARCSPLIT, abi, functionName: 'createInvoice',
  args: [payer, recipientA, recipientB, amountBaseUnits, bpsA, bpsB, expiryUnixSeconds, referenceHash] })

// 2. payer approves exactly the invoice amount
writeContract({ address: USDC, abi: erc20Abi, functionName: 'approve', args: [ARCSPLIT, amountBaseUnits] })

// 3. payer settles
writeContract({ address: ARCSPLIT, abi, functionName: 'settleInvoice', args: [id] })
```

Notes:
- Amounts are 6-decimal base units (`100 USDC = 100_000_000n`). On Arc the native gas balance has 18 decimals; never mix the two views.
- Percentages are basis points: 70% = `7000`; `bpsA + bpsB` must equal `10000`.
- `getInvoice(id).status`: 1 Open, 2 Paid, 3 Cancelled. "Expired" is `status == 1 && isExpired(id)`.
- Get the receipt hash from the `InvoicePaid` event filtered by `id`.
- `referenceHash` is a `bytes32`; the demo uses `keccak256` of a short text label (zero hash when empty).
- Keep fixture data and onchain data separate: label fixtures clearly and never show a fixture as a confirmed payment.
- Custom errors you can map to messages: `NotPayer`, `NotAuthorized`, `InvoiceNotFound`, `InvoiceNotOpen(status)`, `InvoiceExpired`, `InsufficientAllowance(allowance, amount)`, `ZeroAddress`, `ContractAddressNotAllowed`, `IdenticalRecipients`, `ZeroAmount`, `InvalidBasisPoints`, `InvalidExpiry`, `ZeroPayout`.

## Test coverage summary

60 Foundry tests: constructor validation, every invalid creation input, happy-path settlement (70/30 of 100 USDC), unauthorized settlement (recipient, creator, stranger), missing and insufficient allowance, insufficient balance, double settlement, settlement after cancel and after expiry (and exactly at expiry), cancellation by creator, payer and strangers, nonexistent ids, blocklisted-recipient atomicity, rounding conservation, two fuzz tests, and two invariants (the contract's USDC balance is always zero).
