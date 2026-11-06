# ArcSplit contract workspace (owner: Kishore)

Foundry project for `ArcSplit`: two-recipient USDC invoices settled atomically on Arc Testnet.

```bash
npm ci          # @openzeppelin/contracts 5.1.0 + forge-std (no submodules)
forge build
forge test -vv
```

- Contract: `src/ArcSplit.sol`
- Tests: `test/ArcSplit.t.sol` (mocks in `test/mocks/`; mocks are never deployed)
- ABI: `abi/ArcSplit.json` (`node script/export-abi.mjs` after `forge build`)
- Deployment: `script/live-arc-testnet.sh` → `deployments/arc-testnet.json` (written only from a receipt re-verified on the public Arc RPC)
- Frontend handoff, selectors, errors and network details: [`../docs/chain-handoff.md`](../docs/chain-handoff.md)

Arc Testnet only (chain 5042002, USDC `0x3600000000000000000000000000000000000000`). Never commit `.env`.
