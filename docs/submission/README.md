# ArcSplit — programmable USDC invoice splits

ArcSplit lets an invoice creator define one payer, two recipients, a USDC amount, and a basis-point split. A successful settlement pays both recipients directly in one transaction. Integer arithmetic floors recipient A's share and assigns the remainder to B, so the two amounts sum exactly to the invoice total.

## Why Arc

USDC is the unit of account and settlement asset. ArcSplit makes one invoice settlement enforce both payouts atomically, with explicit payer authorization, expiry, cancellation, and duplicate-payment prevention. A failed token transfer reverts the whole EVM transaction. ETHGlobal's current Arc Mumbai smart-contract bounty specifically includes payment splitting and requires a judge-openable Arc Studio project, Studio in the demo, a working app and architecture diagram, video/presentation, and repository documentation. The project does not yet have the required Studio URL or real deployment evidence, so bounty eligibility is not claimed. See the [official Arc prize page](https://ethglobal.com/events/mumbai/prizes/arc).

## Architecture

The browser app validates invoices and presents recipient payouts. It has a clearly labeled fixture mode for deterministic local demos and a separate live path that remains disabled unless verified deployment metadata is present. The contract stores invoice terms, authorizes the designated payer, and sends both USDC transfers directly from that payer. See [architecture](../architecture.md).

Two ABI profiles remain explicit: the preserved Studio interface (`studio-v1`) and Kishore's separate implementation (`kishore-v1`). An isolated Studio-derived candidate is available for review under `chain/studio-candidate/`; the profile is not owner-approved or deployed. See the [candidate review](../reviews/2026-11-06-studio-candidate-readiness.md).

## Run the local fixture demo

```bash
npm ci
npm run dev
```

Open the local app and use its fixture flow. Any simulated payment state is demo evidence only. For frontend checks, run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` from the repository root.

For Solidity, use `npm ci && forge build && forge test -vv` from `chain/`. The Studio candidate has a separate Foundry project at `chain/studio-candidate/` and must be built/tested separately. GitHub Actions runs both suites and the deployment-script safety tests.

## Security and current chain status

Contract behavior includes designated-payer checks, one-time settlement, expiry, cancellation, integer payouts, safe ERC20 transfers and atomic rollback. Deployment scripts require explicit gates and are covered by offline fake-tool tests. The web evidence verifier reads RPC data only; it never signs or submits transactions.

No ArcSplit contract address, invoice transaction, approval transaction, settlement transaction, or recipient balance evidence is currently recorded. `web/config/deployment.json` remains `null`, and no payment has been represented as real.

## Studio origin and submission evidence

The repository preserves a Studio export snapshot. That snapshot is not a judge-openable Studio project URL. The proposed candidate has not been shown to originate from a currently accessible Studio session, and no original project chat/screenshots are attached. Obtain those from the actual authenticated project, then show the Studio project in the final recording. Do not substitute the export folder for a share URL.

See the [evidence manifest](evidence-manifest.md) and [demo outline](evidence-manifest.md#three-minute-demo-outline) for required artifacts and their current status.
