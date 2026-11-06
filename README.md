# ArcSplit

One invoice. Two contributors. One payment.

A mobile-friendly USDC invoice splitter targeting **Best Smart Contracts with Advanced Stablecoin Logic, In Arc Studio** at ETHGlobal Mumbai 2026.

**Status: fixture frontend in development; contract and real testnet settlement pending. Arc Studio project creation is blocked by unavailable browser access. This is not submission-ready.**

## Run

Node 22+ and npm:

```
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Open http://localhost:3000. DEMO DATA is always visible; fixtures never sign transfers or claim onchain payment. Injected wallets can connect for real network and USDC balance inspection. Contract writes await Kishore's confirmed ABI and deployment.

## Team and handoff

Suraj owns frontend, root config and submission docs. Kishore owns `chain/**` and `docs/chain-handoff.md`. See [contribution protocol](CONTRIBUTING.md), [architecture and proposed ABI](docs/architecture.md), [Studio blocker and exact prompt](docs/arc-studio.md), [demo checklist](docs/demo.md) and [AI disclosure](AI_USAGE.md).

No contract address, Studio share URL or transaction evidence exists yet. Use official Arc Testnet USDC, not a custom token. Network sources are recorded in architecture docs. MIT for original code; dependencies retain their own licenses.

## Coordination

GitHub uses one-based issue numbers:

- [Shared architecture and ABI agreement (#1)](https://github.com/surajgojanur/arc-splitpay-mumbai-2026/issues/1)
- [Kishore: contract and ABI (#2)](https://github.com/surajgojanur/arc-splitpay-mumbai-2026/issues/2)
- [Suraj: frontend (#3)](https://github.com/surajgojanur/arc-splitpay-mumbai-2026/issues/3)
- [Kishore: deployment (#4)](https://github.com/surajgojanur/arc-splitpay-mumbai-2026/issues/4)
- [Browser integration (#5)](https://github.com/surajgojanur/arc-splitpay-mumbai-2026/issues/5)
- [Submission package (#6)](https://github.com/surajgojanur/arc-splitpay-mumbai-2026/issues/6)
- [Studio access blocker (#7)](https://github.com/surajgojanur/arc-splitpay-mumbai-2026/issues/7)

The fixture frontend passes 17 unit tests and 3 Chromium browser scenarios. See [validation and screenshot evidence](docs/demo.md#frontend-validation-evidence--2026-11-06).

![ArcSplit fixture preview](web/public/screenshots/landing.png)
