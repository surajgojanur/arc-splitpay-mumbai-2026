# ArcSplit

Pay one USDC invoice and have it split automatically between two recipients, in a single settlement transaction on Arc Testnet. For example, a client pays 100 USDC and Developer A receives 70 while Developer B receives 30.

Built with [Arc Studio](https://studio.arc.io)

## What it does

- Connect a wallet and create an invoice with a payer, two recipients, an amount, a percentage split and an expiry.
- See each recipient's payout before creating the invoice.
- The payer approves USDC and pays; both recipients are paid directly and atomically.
- Open any invoice to see its status (open, paid, cancelled, expired), both payouts and the transaction hash.
- Unpaid invoices can be cancelled by the creator or the payer.
- Arc Testnet only. Testnet USDC has no real value.

## Tech stack

React, Vite, TypeScript, Tailwind CSS, wagmi, viem, ConnectKit. Solidity 0.8.28 with Foundry and OpenZeppelin.

## Development

Prerequisites: [Bun](https://bun.sh) and [Foundry](https://book.getfoundry.sh).

```bash
bun install
bun run dev          # web app
bun run contracts:build
bun run contracts:test
bun run check        # lint and typecheck
```

### Environment variables

| Name | Purpose |
| --- | --- |
| `VITE_ARCSPLIT_ADDRESS` | Address of the deployed ArcSplit contract on Arc Testnet. Until set, the app shows a "not deployed" state |
| `VITE_ARCSPLIT_DEPLOY_BLOCK` | Optional. Block of the deployment; bounds the lookup of receipt transactions |
| `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS` | Optional outside Arc Studio. Provisioned by Arc Studio for backend RPC access; not used by the web app |

Copy `.env.example` to `.env` to get started.

## Documentation

- `docs/architecture.md`: diagrams, rules and real-versus-test data
- `docs/handoff/README.md`: review package for integrating with an existing repository (ABI, interface, deployment steps)
