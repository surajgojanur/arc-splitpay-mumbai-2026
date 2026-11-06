# Proposed contract choice for issue #1

Select the Studio-derived `studio-v1` implementation in this directory for the
next deployment milestone. This is the concrete proposal for owner review in
issue #1; merging code alone has not recorded that approval. `selection.json`
pins the exact source, ABI, compiler settings and dependency lockfile reviewed.
It is not `chain/deployment-profile.json` and cannot authorize a broadcast.

The reason for this choice is to retain the exported Studio interface and its
provenance while adding official-USDC/six-decimal constructor checks and a
reentrancy guard. The original export remains in `docs/studio-original/`.
The independent `chain/src/ArcSplit.sol` remains the `kishore-v1` implementation;
its ABI, deployment scripts and handoff below must never be used for this source.

## Exact interface agreement proposed

```solidity
constructor(address usdcAddress);
function createInvoice(address payer, address recipientA, address recipientB,
    uint128 amount, uint16 bpsA, uint16 bpsB, uint64 expiry,
    bytes32 referenceHash) external returns (uint256 id);
function settleInvoice(uint256 id) external;
function cancelInvoice(uint256 id) external;
function getInvoice(uint256 id) external view returns (Invoice memory);
```

`Invoice` fields, in ABI tuple order:
`address creator, address payer, address recipientA, address recipientB,
uint128 amount, uint16 bpsA, uint16 bpsB, uint64 expiry, uint64 createdAt,
uint64 paidAt, uint8 status, bytes32 referenceHash`.

| Decision | Selected behavior |
| --- | --- |
| Payer and creator | Caller is creator; explicit payer alone may settle. Creator or payer may cancel an Open invoice, even after expiry. |
| Status and IDs | None=0, Open=1, Paid=2, Cancelled=3. IDs start at 1. Unknown IDs revert `InvoiceNotFound(id)`. |
| Expiry | Unix seconds. Creation requires a future expiry. Settlement is valid **at** expiry; expired means `now > expiry`. |
| Amounts | `uint128` USDC atomic units, six decimals; both shares positive and sum to 10,000. A gets floor(amount × bpsA / 10,000), B gets the remainder; both payouts must be nonzero. |
| Recipients | Nonzero, distinct, and neither may be the invoice contract. Payer may be a recipient. |
| Reference | Opaque caller-supplied `bytes32 referenceHash`, retained without interpretation. |
| Token | Immutable official Arc Testnet USDC, with code and `decimals()==6` enforced in constructor. |
| Settlement | Exact-amount approval recommended; direct payer-to-recipient transfers, atomic rollback on either failure, terminal Paid state and reentrancy guard. |

Events (full signatures and errors are in `abi/ArcSplit.studio-v1.json`):

```solidity
event InvoiceCreated(uint256 indexed id, address indexed creator,
    address indexed payer, address recipientA, address recipientB,
    uint256 amount, uint16 bpsA, uint16 bpsB, uint64 expiry, bytes32 referenceHash);
event InvoicePaid(uint256 indexed id, address indexed payer,
    address recipientA, address recipientB, uint256 payoutA, uint256 payoutB, uint256 amount);
event InvoiceCancelled(uint256 indexed id, address indexed cancelledBy);
```

Additive reads are `usdc()`, `nextInvoiceId()`, `BPS_DENOMINATOR()`,
`isExpired(uint256)`, `payoutsOf(uint256)` and `previewPayouts(uint128,uint16)`.
Frontend must use its existing `studio-v1` profile, tuple decoder and inclusive
expiry boundary. It must not call `payInvoice` or decode the flat Kishore tuple.

## Reproduce the review

From this directory:

```sh
npm ci
forge build
forge test -vv
node ../script/check-studio-abi.mjs
```

The ABI check verifies pinned review inputs, equality with the preserved Studio
ABI, and equality with the freshly compiled ABI. Source/build/dependency changes
require refreshed hashes and another review; hashes do not establish safety.

## Acceptance and next issue

Issue #1 can close after both owners acknowledge this exact source/profile and
semantics in the issue. Approval must link this proposal and its pinned inputs.
No owner response or deployment approval is assumed by this proposal.

Issue #4 must add a reviewed Studio deployment path before any broadcast: current
scripts support only `kishore-v1`. Publish receipt-backed metadata at
`chain/deployments/arc-testnet.json` using the architecture schema (`chainId`,
`contractAddress`, `usdcAddress`, `usdcDecimals`, `deploymentBlock`,
`deploymentTransactionHash`, `compilerVersion`, `sourceCommit`, `explorerUrl`).
Frontend activation additionally needs explicit `studio-v1`, reviewed runtime
and ABI hashes through its existing metadata preparation flow. Keep its config
null until verified. Deployment needs separate authorization and a team wallet;
real payouts and Studio project/share evidence remain outstanding.
