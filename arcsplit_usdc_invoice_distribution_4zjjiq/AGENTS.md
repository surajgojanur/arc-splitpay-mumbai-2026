# ArcSplit

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

ArcSplit: a payer settles one USDC invoice and the `ArcSplit` contract splits it atomically to two recipients by basis points (for example 100 USDC as 70/30). Arc Testnet only. The dashboard creates, approves, pays, cancels and shows receipts, reading everything from chain.

Status: contract written, reviewed and tested (60 Foundry tests). NOT deployed: a deployment needs an explicitly authorized wallet. Once deployed, record the address below and set `VITE_ARCSPLIT_ADDRESS` (and optionally `VITE_ARCSPLIT_DEPLOY_BLOCK`) in `.env`, then restart the dev server.

Deployed contracts: none yet.

Rules for agents: never fabricate invoices, hashes or receipts; the payout preview is the only locally computed value. Do not push to the team's GitHub repo (surajgojanur/arc-splitpay-mumbai-2026); hand off files under `docs/handoff/` instead. Suraj owns frontend and GitHub; Kishore owns contracts, tests and deployment.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `contracts/ArcSplit.sol`, `contracts/interfaces/IArcSplit.sol`, `contracts/test/ArcSplit.t.sol`
- `src/App.tsx` - Composition root
- `src/contracts/` - ABI and address config; `src/hooks/` - tx lifecycle and invoice reads
- `docs/architecture.md`, `docs/handoff/` - diagrams and review package
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## Share links

- Starter apps already ship `getShareBase`, `buildShareLink` and `installShareSync` in `src/lib/share.ts`; import them instead of rewriting them.
- Keep shareable state in the URL path or query, not in the `#fragment`.
- Never put a secret (private key, claim secret, seed phrase, session token, API key) in the URL path or query, encoded or not: every in-app path and query is mirrored to the visitor's studio.arc.io address bar and browser history and reaches servers. A bearer claim secret goes only in the `#fragment` appended to the share link (`` `${await buildShareLink('/claim')}#${secret}` ``) and is read from `location.hash` on load. A link to the app's own share URL shown inside the app must be copy-only or open in a new tab with `target="_blank" rel="noopener noreferrer"`.
- Build every link a user copies or sends with `buildShareLink()` from `src/lib/share.ts`.
- Keep the `installShareSync()` call in `src/main.tsx` when editing it; it keeps the Studio address bar in step with in-app navigation.
- Navigate inside the app with relative links.

## To Run

```bash
bun install
bun run dev
```
