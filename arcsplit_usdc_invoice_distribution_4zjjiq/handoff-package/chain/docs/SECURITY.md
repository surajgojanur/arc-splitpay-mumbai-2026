# ArcSplit security assumptions and known limitations

## Review status

- Two internal automated reviews (rule-corpus review and a functional/adversary review) returned no material findings.
- 60 Foundry tests, including fuzz and invariant tests, pass (see `docs/chain-handoff.md` for the exported-project run).
- **Not** reviewed by a third-party auditor. Do not use with real funds without one. This package targets testnet only.

## Assumptions

1. The configured token is the official Arc USDC ERC-20 interface (`0x3600000000000000000000000000000000000000`, 6 decimals). The constructor only checks that code exists at the address; it does not check identity or decimals. `DeployArcSplit.s.sol` checks the chain id and `decimals() == 6` before deploying.
2. The token behaves like USDC: exact-amount transfers, no fee-on-transfer, no rebasing, no transfer hooks. Other tokens are unsupported.
3. `block.timestamp` is accurate enough for expiry at the granularity of seconds to minutes.
4. The payer signs `settleInvoice` themselves. Nobody else can move the payer's funds through ArcSplit, even with an existing allowance, because the caller must equal the invoice's `payer`.

## Properties the tests establish

- The contract never holds USDC (invariant over random create/settle/cancel/time-warp sequences).
- `payoutA + payoutB == amount` for every valid split (fuzzed).
- A failing transfer (for example a blocklisted recipient) reverts the whole settlement; the invoice stays `Open` and no recipient is paid.
- A paid or cancelled invoice cannot be settled or cancelled again.

## Known limitations

| Limitation | Impact | Mitigation |
| --- | --- | --- |
| Anyone can create an invoice naming any payer and recipients | Spam or phishing invoices that name a victim as payer. Nothing is taken unless the victim approves and pays | UIs must show creator, recipients and amounts before the pay step; payers should only pay invoices they recognize |
| Open invoices past expiry stay `Open` in storage | State lingers until cancelled; `getInvoice().status` alone does not show expiry | Use `isExpired(id)` or compare `expiry` to chain time |
| Unspent allowance after cancel or expiry | The payer's approval stays at the ArcSplit address | Only the payer can use it, but advise revoking with `approve(ArcSplit, 0)` |
| USDC blocklist | A blocklisted payer or recipient makes settlement revert (gas is still spent) | Payer or creator cancels and re-issues with a different recipient |
| No upgrade, pause or admin | A bug cannot be patched in place | Deploy a new instance and migrate by creating new invoices |
| `referenceHash` is opaque and unverified | It is a label, not proof of anything | Keep the preimage off-chain |
| `amount` limited to `uint128`, `bps` to `uint16` | Practically irrelevant for USDC | None needed |
| Browser clock used by the demo app to pick `expiry` | A skewed clock can produce a short or rejected expiry | Prefer chain time (latest block timestamp) for the offset in production UIs |
| Payer or recipient can be a contract | Smart-wallet payers work; a recipient contract just receives ERC-20 tokens (no callback) | None needed |
| Tested on a stock EVM with mock tokens | Real Arc behavior (blocklist enforcement, USDC system events, gas floor, Osaka baseline) is not reproduced | Run the integration checklist below on an Arc fork or the live testnet before relying on it |
| Compiled with `evm_version = "cancun"`, Arc baseline is Osaka | No known incompatibility (no Osaka-specific opcodes used) | Confirm in the fork run |

## Checklist for Kishore before the testnet deployment

1. Read `chain/src/ArcSplit.sol` end to end (about 180 lines).
2. Confirm or change the interface differences listed in `docs/chain-handoff.md` ("Interface decision") **before** deploying; an ABI change after deployment means a redeploy.
3. Run `forge build` and `forge test` in `chain/` (fresh clone, after `setup.sh`).
4. Run the deploy script in simulation mode against `arc_testnet` (no `--broadcast`).
5. Run an Arc-specific fork test (Arc Foundry `arc-anvil --network arc`) covering: real USDC `approve`, `settleInvoice` for a 70/30 split, balance deltas on both recipients, and a settlement to a blocklisted address if a test address is available.
6. Deploy from the team wallet using a keystore or hardware signer, never a raw key on the command line.
7. Record the real address, deployment transaction hash and block in `chain/deployments/arc-testnet.json` from the template. Do not invent values.
8. Smoke-test on testnet: create, approve, settle, and cancel a second invoice.
