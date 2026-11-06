# ArcSplit integration contract

Source of truth: `chain/src/ArcSplit.sol`. Interface: `chain/src/interfaces/IArcSplit.sol`. ABI: `chain/abi/ArcSplit.json`.

## Deployment

| Item | Value |
| --- | --- |
| Network | Arc Testnet, chain id `5042002`, RPC `https://rpc.testnet.arc.io`, explorer `https://explorer.testnet.arc.io` |
| Constructor | `constructor(address usdcAddress)` (one argument) |
| Constructor argument | `0x3600000000000000000000000000000000000000`, the official Arc Testnet USDC ERC-20 interface |
| Token facts (read from the live chain on 2026-11-06) | `symbol() = "USDC"`, `decimals() = 6` |
| Constructor reverts | `InvalidToken(address)` if the address is zero or has no contract code |
| Owner, admin, upgrade | None |

## Units

- Every amount is a USDC ERC-20 base-unit integer with **6 decimals**: `1 USDC = 1_000_000`, `100 USDC = 100_000_000`.
- `amount` is `uint128`. Payouts are `uint256` in return values and events.
- Arc's native gas balance uses 18 decimals and is the same underlying USDC pool. ArcSplit only uses the 6-decimal ERC-20 view. Never pass an 18-decimal value.

## Basis points and rounding

- `BPS_DENOMINATOR = 10_000`. 70% is `7000`.
- `bpsA > 0`, `bpsB > 0`, and `bpsA + bpsB == 10_000` (checked in `uint256`, no overflow).
- `payoutA = floor(amount * bpsA / 10_000)`; `payoutB = amount - payoutA`.
- Recipient B always receives the rounding remainder, so `payoutA + payoutB == amount` exactly and the contract never keeps dust.
- Creation reverts `ZeroPayout` if either payout would be `0`.
- Example: `1_000_001` at `3333/6667` pays A `333_300` and B `666_701`.

## Expiry

- `expiry` is a Unix timestamp in seconds (`uint64`), must be `> block.timestamp` at creation.
- Inclusive: settlement succeeds when `block.timestamp <= expiry` and reverts `InvoiceExpired` when `block.timestamp > expiry`.
- "Expired" is not a stored status. An unpaid invoice past its expiry stays `Open` in storage; `isExpired(id)` reports it. It can still be cancelled.

## Status encoding

`enum Status { None, Open, Paid, Cancelled }` is returned as `uint8`: `0` None (never returned; unknown ids revert), `1` Open, `2` Paid, `3` Cancelled. UI "Expired" means `status == 1 && isExpired(id)`.

## Permissions

| Action | Who | When |
| --- | --- | --- |
| `createInvoice` | Anyone. `msg.sender` is stored as `creator` | Always |
| `settleInvoice` | Only the invoice's designated `payer` | Status `Open`, not expired, allowance >= amount |
| `cancelInvoice` | The `creator` or the designated `payer` | Status `Open` (also after expiry) |
| Everything else | No privileged functions exist | |

## Solidity signatures

```solidity
enum Status { None, Open, Paid, Cancelled }

struct Invoice {
    address creator;
    address payer;
    address recipientA;
    address recipientB;
    uint128 amount;
    uint16 bpsA;
    uint16 bpsB;
    uint64 expiry;
    uint64 createdAt;
    uint64 paidAt;
    Status status;
    bytes32 referenceHash;
}

constructor(address usdcAddress);

// Create. Returns the new id (starts at 1, increments, never reused).
function createInvoice(
    address payer,
    address recipientA,
    address recipientB,
    uint128 amount,
    uint16 bpsA,
    uint16 bpsB,
    uint64 expiry,
    bytes32 referenceHash   // opaque; use bytes32(0) when unused
) external returns (uint256 id);

// Pay (payer only). Requires USDC.approve(ArcSplit, >= amount) beforehand.
function settleInvoice(uint256 id) external;

// Cancel (creator or payer).
function cancelInvoice(uint256 id) external;

// Reads
function getInvoice(uint256 id) external view returns (Invoice memory); // reverts InvoiceNotFound
function isExpired(uint256 id) external view returns (bool);             // reverts InvoiceNotFound
function payoutsOf(uint256 id) external view returns (uint256 payoutA, uint256 payoutB);
function previewPayouts(uint128 amount, uint16 bpsA) external pure returns (uint256 payoutA, uint256 payoutB);
function usdc() external view returns (address);
function nextInvoiceId() external view returns (uint256);               // id the next invoice will get
function BPS_DENOMINATOR() external view returns (uint256);             // 10000
```

`previewPayouts` accepts `bpsA` from `0` to `10000` and reverts `InvalidBasisPoints` above that; it does not enforce the non-zero rules (creation does).

## Events

```solidity
event InvoiceCreated(
    uint256 indexed id, address indexed creator, address indexed payer,
    address recipientA, address recipientB, uint256 amount,
    uint16 bpsA, uint16 bpsB, uint64 expiry, bytes32 referenceHash
);
event InvoicePaid(
    uint256 indexed id, address indexed payer, address recipientA,
    address recipientB, uint256 payoutA, uint256 payoutB, uint256 amount
);
event InvoiceCancelled(uint256 indexed id, address indexed cancelledBy);
```

The settlement transaction hash for a receipt is the `transactionHash` of the `InvoicePaid` log filtered by `id`. USDC's own `Transfer` events also fire for both payouts.

## Custom errors

```solidity
error InvalidToken(address token);           // constructor
error ZeroAddress();                         // payer or a recipient is address(0)
error ContractAddressNotAllowed();           // payer or recipient is the ArcSplit contract
error IdenticalRecipients();                 // recipientA == recipientB
error ZeroAmount();
error InvalidBasisPoints();                  // bpsA == 0, bpsB == 0, sum != 10000, or previewPayouts bpsA > 10000
error InvalidExpiry();                       // expiry <= block.timestamp
error ZeroPayout();                          // a payout rounds to 0
error InvoiceNotFound(uint256 id);
error NotPayer();                            // settle by anyone but the payer
error NotAuthorized();                       // cancel by anyone but creator or payer
error InvoiceNotOpen(Status currentStatus);  // already Paid or Cancelled
error InvoiceExpired();
error InsufficientAllowance(uint256 allowance, uint256 amount);
```

A payer balance shortfall, or a USDC blocklist rejection, reverts with the token's own error and leaves the invoice `Open`.

## Settlement order of checks

`NotPayer` then `InvoiceNotOpen` then `InvoiceExpired` then `InsufficientAllowance`, then state is set to `Paid` and `paidAt` recorded **before** the two `safeTransferFrom` calls (payer to A, payer to B), then `InvoicePaid` is emitted.

## Client flow

1. Creator calls `createInvoice(...)`, reads `id` from the `InvoiceCreated` log (do not infer it from `nextInvoiceId()`; other creators may race you).
2. Payer calls `USDC.approve(ArcSplit, amount)` (exactly the invoice amount is enough).
3. Payer calls `settleInvoice(id)`.
4. Receipt: `getInvoice(id)`, `payoutsOf(id)` and the `InvoicePaid` log.
