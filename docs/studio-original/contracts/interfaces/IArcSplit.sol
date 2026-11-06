// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IArcSplit — integration interface for ArcSplit
/// @notice Drop this file into any Solidity project (or use docs/handoff/ArcSplit.abi.json from a
/// TypeScript project) to create, settle and cancel two-recipient USDC invoices.
/// @dev Amounts are USDC ERC-20 base units (6 decimals). Splits are basis points out of 10_000.
interface IArcSplit {
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

    function usdc() external view returns (address);
    function nextInvoiceId() external view returns (uint256);

    function createInvoice(
        address payer,
        address recipientA,
        address recipientB,
        uint128 amount,
        uint16 bpsA,
        uint16 bpsB,
        uint64 expiry,
        bytes32 referenceHash
    ) external returns (uint256 id);

    /// @dev Caller must be the designated payer and must have approved >= amount to ArcSplit.
    function settleInvoice(uint256 id) external;

    /// @dev Callable by the creator or the payer while the invoice is Open (also after expiry).
    function cancelInvoice(uint256 id) external;

    function getInvoice(uint256 id) external view returns (Invoice memory);
    function isExpired(uint256 id) external view returns (bool);
    function payoutsOf(uint256 id) external view returns (uint256 payoutA, uint256 payoutB);
    function previewPayouts(uint128 amount, uint16 bpsA) external pure returns (uint256 payoutA, uint256 payoutB);
}
