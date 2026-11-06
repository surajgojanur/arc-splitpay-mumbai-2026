# Chain handoff: ArcSplit (owner: Kishore)

Generated in Arc Studio on 2026-11-06. This file belongs to Kishore under `CONTRIBUTING.md`. Nothing in this package has been pushed to GitHub, deployed, or signed.

## Status

| Item | State |
| --- | --- |
| Contract source | Ready for review: `chain/src/ArcSplit.sol` |
| Tests | 60 of 60 pass in a clean export (see "Verification evidence") |
| Deployment | **Not deployed.** No address, block or transaction exists. `chain/deployments/arc-testnet.template.json` is a template with `null` values |
| Interface vs the repo's proposal | **Differs.** Needs your decision before deployment (next section) |
| Third-party audit | None |

## Interface decision (needs Kishore's acknowledgement in the Architecture issue)

`docs/architecture.md` in this repo proposes an interface "requiring Kishore acknowledgement". ArcSplit was generated from the original product brief and differs from that proposal. Nothing is wrong with either; they just must be reconciled before deployment because the frontend adapter depends on the ABI.

| Topic | Repo proposal | ArcSplit as generated |
| --- | --- | --- |
| Create | `createInvoice(recipientA, recipientB, amount, shareBps, expiry)`; payer is `msg.sender` | `createInvoice(payer, recipientA, recipientB, amount, bpsA, bpsB, expiry, referenceHash)`; payer is an explicit argument, `msg.sender` is stored as `creator` |
| Amount type | `uint256` | `uint128` |
| Split input | one `shareBps` (A's share) | `bpsA` and `bpsB`, must sum to 10000 (B is stored and emitted) |
| Pay | `payInvoice(id)` | `settleInvoice(id)` |
| Cancel permission | designated payer only | creator **or** payer |
| Memo | omitted unless agreed | optional `referenceHash` (`bytes32`) |
| `getInvoice` | returns payer, recipientA, recipientB, amount, shareBps, expiry, status | returns one `Invoice` struct (creator, payer, recipientA, recipientB, amount, bpsA, bpsB, expiry, createdAt, paidAt, status, referenceHash); ABI decoders expose named fields |
| Status encoding | not specified | `0` None, `1` Open, `2` Paid, `3` Cancelled; "expired" derived by `isExpired(id)` |
| `InvoiceCreated` | `(id indexed, payer indexed, recipientA, recipientB, amount, shareBps, expiry)` | `(id indexed, creator indexed, payer indexed, recipientA, recipientB, amount, bpsA, bpsB, expiry, referenceHash)` |
| `InvoicePaid` | `(id indexed, payer indexed, amount, payoutA, payoutB)` | `(id indexed, payer indexed, recipientA, recipientB, payoutA, payoutB, amount)` (argument order differs) |
| `InvoiceCancelled` | `(id indexed, payer indexed)` | `(id indexed, cancelledBy indexed)`; `cancelledBy` can be the creator or the payer |
| ID origin | to be confirmed | starts at 1, increments, never reused |
| Rounding | A = floor(amount * shareBps / 10000), B = remainder, both nonzero | **Same** |
| Units | 6-decimal ERC-20 base units | **Same** |
| Dependencies | none stated | OpenZeppelin `SafeERC20`, `IERC20` |

Options:
- **A (recommended): keep ArcSplit as generated.** It meets the original brief (explicit payer address, payer-only settlement, creator or payer can cancel, optional reference). Suraj writes the live adapter against `chain/abi/ArcSplit.json`. Update `docs/architecture.md` (Suraj's file) to match.
- **B: align the contract to the proposal.** Needs contract edits (rename `settleInvoice` to `payInvoice`, make the caller the payer, single `shareBps`, payer-only cancel, event changes) and a re-run of all tests. Ask in the issue before starting; do not hand-edit the ABI.

## What is in the package

```
chain/
  setup.sh                         pins and installs forge-std and OpenZeppelin as git submodules
  foundry.toml, remappings.txt, .gitignore
  src/ArcSplit.sol
  src/interfaces/IArcSplit.sol
  test/ArcSplit.t.sol              60 tests
  script/DeployArcSplit.s.sol      Arc Testnet only, refuses other chain ids
  abi/ArcSplit.json                path expected by chain/README.md
  deployments/arc-testnet.template.json
  docs/INTEGRATION_CONTRACT.md     exact signatures, units, rounding, expiry, permissions, errors
  docs/SECURITY.md                 assumptions, limitations, pre-deploy checklist
  docs/ARCSPLIT_ARCHITECTURE.md    diagrams (named to avoid colliding with docs/architecture.md)
docs/chain-handoff.md              this file
```

The existing `chain/README.md` is not included and must not be overwritten. Suggested edit: replace "No contract has been implemented or deployed" with a link to this file once you accept the import.

## Import steps (no files overwritten)

```bash
# 1. Extract the archive somewhere outside the repo
tar -xzf arcsplit-handoff.tar.gz            # creates handoff-package/

# 2. In your clone, use a dedicated branch (never main)
cd arc-splitpay-mumbai-2026
git switch -c import/arcsplit-studio-handoff

# 3. Copy without clobbering anything that already exists (keeps chain/README.md)
rsync -a --ignore-existing ../handoff-package/chain/ chain/
mkdir -p docs && rsync -a --ignore-existing ../handoff-package/docs/chain-handoff.md docs/

# 4. Install the pinned dependencies (git submodules under chain/lib)
bash chain/setup.sh

# 5. Verify
cd chain && forge build && forge test
git status    # confirm only chain/** and docs/chain-handoff.md changed
```

Then open a **draft PR** from `import/arcsplit-studio-handoff` and post the coordination comment from `CONTRIBUTING.md`. `FOUNDRY_PROFILE=quick forge test` runs the invariants with fewer runs for faster iteration; the full run takes about 2.5 minutes.

## Verification evidence

Run on 2026-11-06 from a clean copy of `chain/` placed in a new git repository, dependencies installed with `setup.sh`, Foundry 1.7.1:

| Check | Result |
| --- | --- |
| `bash setup.sh` | exit 0. forge-std v1.17.0 (`f3dae6e6ee381f25eb6a246f7da9b85c91a68219`), openzeppelin-contracts v5.6.1 (`5fd1781b1454fd1ef8e722282f86f9293cacf256`) |
| `forge build` | exit 0 (lint notes only: `block.timestamp` comparisons and one test typecast) |
| `forge test` | **60 passed, 0 failed, 0 skipped** (58 unit/fuzz, 2 invariants at 256 runs x 500 depth) |
| Exported `ArcSplit.sol` vs source project | byte-identical |
| USDC at `0x3600...0000` on Arc Testnet | `symbol() = "USDC"`, `decimals() = 6` (live read) |
| Deploy script simulation | see the line below |

Deploy script simulation (read-only, no `--broadcast`, no key, no transaction sent): succeeded against live Arc Testnet (chain 5042002). It confirmed code at the USDC address and `decimals() == 6`, and estimated about 1.28M gas, roughly 0.065 USDC at the 50.9 gwei estimate. The address the simulation printed is a simulated value, **not a deployment**; do not use it.

Test results are for stock-EVM Foundry with mock tokens. They do **not** prove behavior against real Arc USDC (blocklist, system events). See the checklist in `chain/docs/SECURITY.md`.

## Deployment instructions (Kishore, team wallet)

1. Complete the checklist in `chain/docs/SECURITY.md`, including the interface decision above.
2. Import a team keystore (`cast wallet import arcsplit-deployer --interactive`). Never pass a raw private key on the command line.
3. Fund the deployer with testnet USDC for gas using the Circle faucet.
4. Simulate, then broadcast:

```bash
cd chain
forge script script/DeployArcSplit.s.sol:DeployArcSplit \
  --rpc-url arc_testnet --account arcsplit-deployer --sender <deployer-address>

forge script script/DeployArcSplit.s.sol:DeployArcSplit \
  --rpc-url arc_testnet --account arcsplit-deployer --sender <deployer-address> --broadcast
```

5. Copy `deployments/arc-testnet.template.json` to `deployments/arc-testnet.json` and fill every field from the real broadcast output (`broadcast/` folder: address, transaction hash, block number; `sourceCommit` from git). Export the ABI again with `forge inspect ArcSplit abi --json > abi/ArcSplit.json` if the contract changed.
6. Smoke test on testnet: create, approve, settle, and cancel a second invoice; confirm both recipient balances.
7. Post `STATUS: READY_FOR_REVIEW` in the issue with the address and deployment block so Suraj can set `NEXT_PUBLIC_CONTRACT_ADDRESS` and `NEXT_PUBLIC_DEPLOYMENT_BLOCK`.

## Things Kishore must review before testnet deployment

1. The interface decision (Option A or B) and the Architecture issue acknowledgement.
2. Whether anyone-can-create-an-invoice is acceptable (spam invoices naming a payer; see `SECURITY.md`).
3. Whether creator-or-payer cancellation matches the product (the proposal said payer only).
4. Rounding: A floored, B takes the remainder, both must be nonzero.
5. Arc-specific behavior on a fork (USDC blocklist, address(0) rules, Osaka baseline); only mock-token tests exist today.
6. The `evm_version = "cancun"` setting against Arc's Osaka baseline.
7. Third-party notices: OpenZeppelin (MIT) is pulled in as a submodule; keep its license intact.
