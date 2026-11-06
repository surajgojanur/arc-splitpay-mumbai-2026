# Demo and submission checklist

Run `npm ci`, `npm run dev` and open http://localhost:3000. The current app is conspicuously marked DEMO DATA. Connect an injected EVM wallet for network/balance inspection, or use the explicit fixture wallet. Create a 100 USDC, 70/30 invoice, review payouts, simulate approval and settlement and inspect the fixture receipt. No simulated transaction is payment proof.

## Video script (recording pending)
1. Show Arc Studio project and original generation (blocked).
2. Explain: one invoice pays two contributors, once.
3. Connect Arc Testnet payer, enter recipients and 100 USDC with 70/30 split.
4. Show required allowance approval and real settlement signatures.
5. Open explorer transaction and recipient transfer logs; show 70 and 30 USDC received.
6. Show duplicate, wrong payer, expiry and cancellation rejection; show architecture and GitHub.

## Completion
- [x] Public GitHub repository and frontend scaffold
- [x] Architecture diagram and AI disclosure
- [ ] Real Arc Studio starting point and shareable URL
- [ ] Kishore confirms shared interface
- [ ] Contract tests, deployment and verification
- [ ] Live ABI integration and complete testnet payment
- [ ] Recipient receipt proof and explorer links
- [ ] Final Studio demonstration
- [ ] Demo video and presentation

Chosen bounty: **Best Smart Contracts with Advanced Stablecoin Logic, In Arc Studio**. Not submission-ready; eligibility is not claimed.
