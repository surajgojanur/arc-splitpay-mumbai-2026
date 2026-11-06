# ArcSplit chain handoff (Kishore → Suraj)

Owner: Kishore (`chain/**`, this file). Interface agreed-in-principle per proposal in `docs/architecture.md`; confirmation requested in issue #1.

## Status (2026-11-06)

| Item | State |
|---|---|
| Contract `chain/src/ArcSplit.sol` | Implemented; 49 Foundry tests pass in CI, owner approval of final source/profile remains pending |
| ABI `chain/abi/ArcSplit.json` | Exported (plain ABI array) |
| Arc Testnet deployment | **Not deployed.** No deployment wallet has been approved or inspected; no wallet was funded or used in this sprint |
| `chain/deployments/arc-testnet.json` | **Does not exist yet.** Written only by `script/write-deployment.mjs` from a receipt re-verified on the public Arc RPC |
| Deployment profile tooling | `live-arc-testnet.sh` is gated to `kishore-v1`; the proposed Studio-derived candidate has no deployment/preflight path and remains disabled |
| Live payment / tx hashes | None yet |
| Arc Studio | Exported Studio source is preserved under `docs/studio-original/`; judge-openable project URL and original session evidence remain missing. A separate Studio-derived candidate is proposed in `chain/studio-candidate/` and is not owner-approved |

Do not enable live writes until `chain/deployments/arc-testnet.json` exists.

The action script supports macOS's default Bash 3.2: address/hash comparisons use portable lowercase conversion. Offline tests include a valid payment path to the refusing Forge stub, so an unrelated shell error cannot stand in for successful safety checks. Zero recipient addresses are rejected before Forge.

Gas/token balance comparisons and recipient balance deltas use `script/amounts.mjs` with bigint arithmetic across the full uint256 range. Shell signed-integer arithmetic is not used for chain amounts; malformed or out-of-range values stop the action.

## Network (verified live 2026-11-06)

| | |
|---|---|
| Chain ID | `5042002` (`eth_chainId` → `0x4cef52`) |
| RPC | https://rpc.testnet.arc.io |
| Explorer | https://explorer.testnet.arc.io |
| USDC (ERC-20 interface) | `0x3600000000000000000000000000000000000000`, `decimals()` → `6` (checked via `eth_call`) |
| Gas token | USDC (native, 18-decimal precision). Never mix with the 6-decimal ERC-20 amounts |

Source: https://docs.arc.io/arc/references/connect-to-arc and https://docs.arc.io/arc/references/contract-addresses

## Contract

`ArcSplit` — `constructor(address usdc)`. The token is immutable, and the constructor reverts with `InvalidToken` unless it is a contract reporting 6 decimals. There is no owner, no admin and no withdraw function, and the contract never holds funds.

### Functions

| Signature | Selector | Who | Notes |
|---|---|---|---|
| `createInvoice(address recipientA, address recipientB, uint256 amount, uint16 shareBps, uint64 expiry) returns (uint256 id)` | `0x25bfc2eb` | anyone; caller becomes payer | Moves no funds |
| `payInvoice(uint256 id)` | `0xac60a6cd` | payer only | Needs prior USDC `approve(ArcSplit, amount)` |
| `cancelInvoice(uint256 id)` | `0xda9c273d` | payer only | Open invoices only (including expired ones) |
| `getInvoice(uint256 id) view returns (address payer, address recipientA, address recipientB, uint256 amount, uint16 shareBps, uint64 expiry, uint8 status)` | `0x3a23cc0a` | — | Unknown id → zeros, status 0 |
| `previewPayouts(uint256 amount, uint16 shareBps) pure returns (uint256 payoutA, uint256 payoutB)` | `0x220f5b06` | — | Use for UI preview so numbers match the contract exactly |
| `invoiceCount() view returns (uint256)` | `0x1346f0c4` | — | ids are `1..invoiceCount` |
| `usdc() view returns (address)` | `0x3e413bee` | — | Validate equals the official USDC before enabling writes |
| `BPS_DENOMINATOR() → 10000`, `USDC_DECIMALS() → 6` | | — | constants |

### Status encoding (`uint8`)

`0 None` (no such id) · `1 Open` · `2 Paid` · `3 Cancelled`.
"Expired" is **derived**: `status == 1 && now >= expiry`. Payment is accepted while `block.timestamp < expiry`.

### Events

| Signature | topic0 |
|---|---|
| `InvoiceCreated(uint256 indexed id, address indexed payer, address recipientA, address recipientB, uint256 amount, uint16 shareBps, uint64 expiry)` | `0xa64b246a5fea9dda213b3a1b2b2553a401a8cfe3ee7222f33e32ffddfcbdc1a7` |
| `InvoicePaid(uint256 indexed id, address indexed payer, uint256 amount, uint256 payoutA, uint256 payoutB)` | `0xdc6d8da4249173526e17494d1bd40513c58122841f299522184c7a83d227495e` |
| `InvoiceCancelled(uint256 indexed id, address indexed payer)` | `0x1893bd55c53ca5d28463267b3794ea27b1c3fc3b0cc5f86e0c5b613ad4156f08` |

To get the id after `createInvoice`, read `InvoiceCreated` from the receipt (or simulate the call first and use its return value). A paid invoice's tx also contains two USDC `Transfer(payer → recipientA/B)` logs. For history, filter by `payer` (topic 2) from `deploymentBlock`.

### Validation and errors

| Error | Selector | When |
|---|---|---|
| `InvalidRecipient()` | `0x9c8d2cd2` | recipient is zero, or A == B |
| `InvalidAmount()` | `0x2c5211c6` | amount is 0, or a payout rounds to 0 (e.g. 1 unit at 70%) |
| `InvalidShare()` | `0x100d5f74` | `shareBps` is 0 or ≥ 10000 |
| `InvalidExpiry()` | `0xd36c8500` | `expiry <= block.timestamp` |
| `NotPayer()` | `0x1435e357` | pay/cancel by anyone other than the payer |
| `InvoiceNotOpen()` | `0x094311f1` | unknown id, already paid (duplicate), or cancelled |
| `InvoiceExpired()` | `0xf04e9cf0` | pay at/after expiry |
| `InvalidToken()` | `0xc1ab6dc1` | constructor only |
| `ReentrancyGuardReentrantCall()` | `0x3ee5aeb5` | reentrancy attempt |
| `SafeERC20FailedOperation(address)` | `0x5274afe7` | token returned false |
| USDC `ERC20InsufficientAllowance` / `ERC20InsufficientBalance` | (from token) | approve too small or balance too low. **Whole tx reverts; no partial payout** |

Order of checks in `payInvoice`: status → payer → expiry. So paying a cancelled or paid invoice as a non-payer reports `InvoiceNotOpen`.

viem/wagmi decode these automatically from the ABI (it includes the errors). Map them to user messages and don't show raw hex.

## Amounts and rounding

- All amounts are USDC atomic units, **6 decimals**: `parseUnits("100", 6) = 100000000n`. Use bigint, never floats.
- `payoutA = amount * shareBps / 10000` (floor), `payoutB = amount - payoutA`, so the sum is always exactly `amount`. Rounding dust goes to B.
- 70/30 → `shareBps = 7000`. 100 USDC → A `70000000`, B `30000000`.
- Expiry is unix **seconds** (`uint64`). Use the chain's clock for comparisons when possible.

## Wallet flow (payer)

1. Ensure chain 5042002 and that the wallet has USDC for the invoice plus a little for gas (gas is also paid in USDC).
2. `createInvoice(...)` → read `id` from `InvoiceCreated`.
3. Check `USDC.allowance(payer, ArcSplit)`; if `< amount`, call `USDC.approve(ArcSplit, amount)` (exact amount recommended, not unlimited).
4. `payInvoice(id)` → one tx, two USDC transfers, `InvoicePaid` event.
5. Recipients do nothing.

Cancel: `cancelInvoice(id)` by payer while status is Open.

## Artifacts

- `chain/abi/ArcSplit.json`: plain JSON ABI array (functions, events, errors). Regenerate with `forge build && node script/export-abi.mjs`.
- `chain/deployments/arc-testnet.json` (after deploy): `{ chainId, contractAddress, usdcAddress, usdcDecimals, deploymentBlock, deploymentTransactionHash, compilerVersion, sourceCommit, explorerUrl }`, exactly the schema in `docs/architecture.md`.
- Compiler: solc `0.8.28+commit.7893614a`, optimizer 200 runs, EVM `cancun`. OpenZeppelin Contracts `5.1.0`.

## Reproduce

```bash
cd chain
npm ci                      # OpenZeppelin + forge-std (no git submodules)
forge build
forge test -vv              # 48 tests
forge test --gas-report
cp .env.example .env        # fill PRIVATE_KEY (throwaway, faucet-funded), RECIPIENT_A/B
./script/live-arc-testnet.sh   # deploy → write deployments/arc-testnet.json → 1 USDC 70/30 payment → duplicate check
```

Local gas (Foundry, mock token): deploy ≈ 658k, `createInvoice` ≈ 138k, `payInvoice` ≈ 107k median (two transfers), `cancelInvoice` ≈ 26k. A live simulation against Arc Testnet estimated ≈ 0.043 USDC to deploy.

## Security assumptions and limitations

- Token fixed to official Arc USDC at deploy, with no arbitrary tokens. USDC is not fee-on-transfer and is not rebasing.
- CEI: status is set to Paid before the transfers, plus OpenZeppelin `ReentrancyGuard`. Tested with a hostile re-entering token.
- USDC can blocklist addresses. If a recipient or payer is blocklisted, `payInvoice` reverts atomically and the invoice stays Open. The payer may cancel it.
- Funds move directly from the payer, so the payer must hold balance and allowance at pay time. Nothing is escrowed at creation.
- Invoice creation is permissionless. Anyone can create invoices that only they can pay. There is no recipient consent step.
- An expired Open invoice stays Open in storage. The UI must derive "Expired".
- Not audited. Hackathon scope.
- Local fork testing limitation: Arc USDC calls an Arc-specific precompile (`0x1800…0001`, blocklist check) that anvil cannot execute. Settlement can therefore only be proven on live Arc Testnet, not on a local fork.
