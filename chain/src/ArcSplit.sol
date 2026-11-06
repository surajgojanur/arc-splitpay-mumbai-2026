// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ArcSplit — two-recipient USDC invoices settled atomically on Arc
/// @notice A payer creates an invoice that splits `amount` USDC between two recipients by basis points.
///         Only that payer can settle it, exactly once, before expiry. Settlement pulls USDC straight from
///         the payer to both recipients in a single transaction; the contract never custodies funds.
/// @dev    Amounts are ERC-20 USDC atomic units (6 decimals). The token is fixed at deployment.
contract ArcSplit is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None, // 0: invoice id does not exist
        Open, // 1: created, awaiting payment (may be expired — see `expiry`)
        Paid, // 2: settled, terminal
        Cancelled // 3: cancelled by payer, terminal
    }

    struct Invoice {
        address payer;
        uint64 expiry;
        Status status;
        uint16 shareBps;
        address recipientA;
        address recipientB;
        uint256 amount;
    }

    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint8 public constant USDC_DECIMALS = 6;

    /// @notice The only token this contract settles in (official Arc USDC ERC-20 interface).
    IERC20 public immutable usdc;

    /// @notice Number of invoices created; ids are 1..invoiceCount.
    uint256 public invoiceCount;

    mapping(uint256 id => Invoice) private _invoices;

    event InvoiceCreated(
        uint256 indexed id,
        address indexed payer,
        address recipientA,
        address recipientB,
        uint256 amount,
        uint16 shareBps,
        uint64 expiry
    );
    event InvoicePaid(uint256 indexed id, address indexed payer, uint256 amount, uint256 payoutA, uint256 payoutB);
    event InvoiceCancelled(uint256 indexed id, address indexed payer);

    error InvalidToken();
    error InvalidAmount();
    error InvalidRecipient();
    error InvalidShare();
    error InvalidExpiry();
    error NotPayer();
    error InvoiceNotOpen();
    error InvoiceExpired();

    constructor(address usdc_) {
        if (usdc_.code.length == 0) revert InvalidToken();
        if (IERC20Metadata(usdc_).decimals() != USDC_DECIMALS) revert InvalidToken();
        usdc = IERC20(usdc_);
    }

    /// @notice Create an invoice payable by `msg.sender`.
    /// @param recipientA Receives `amount * shareBps / 10000` (rounded down).
    /// @param recipientB Receives the remainder, so payouts always sum to `amount`.
    /// @param amount     Total in USDC atomic units (6 decimals).
    /// @param shareBps   Recipient A's share in basis points, 1..9999.
    /// @param expiry     Unix timestamp; payment is accepted while `block.timestamp < expiry`.
    function createInvoice(address recipientA, address recipientB, uint256 amount, uint16 shareBps, uint64 expiry)
        external
        returns (uint256 id)
    {
        if (
            recipientA == address(0) || recipientB == address(0) || recipientA == recipientB
                || recipientA == address(this) || recipientB == address(this)
        ) {
            revert InvalidRecipient();
        }
        if (amount == 0) revert InvalidAmount();
        if (shareBps == 0 || shareBps >= BPS_DENOMINATOR) revert InvalidShare();
        (uint256 payoutA, uint256 payoutB) = previewPayouts(amount, shareBps);
        if (payoutA == 0 || payoutB == 0) revert InvalidAmount();
        if (expiry <= block.timestamp) revert InvalidExpiry();

        id = ++invoiceCount;
        _invoices[id] = Invoice({
            payer: msg.sender,
            expiry: expiry,
            status: Status.Open,
            shareBps: shareBps,
            recipientA: recipientA,
            recipientB: recipientB,
            amount: amount
        });

        emit InvoiceCreated(id, msg.sender, recipientA, recipientB, amount, shareBps, expiry);
    }

    /// @notice Settle an open, unexpired invoice. Caller must be the payer and must have approved
    ///         this contract for at least `amount` USDC.
    function payInvoice(uint256 id) external nonReentrant {
        Invoice storage inv = _invoices[id];
        if (inv.status != Status.Open) revert InvoiceNotOpen();
        if (msg.sender != inv.payer) revert NotPayer();
        if (block.timestamp >= inv.expiry) revert InvoiceExpired();

        // Effects before interactions.
        inv.status = Status.Paid;
        (uint256 payoutA, uint256 payoutB) = previewPayouts(inv.amount, inv.shareBps);

        usdc.safeTransferFrom(msg.sender, inv.recipientA, payoutA);
        usdc.safeTransferFrom(msg.sender, inv.recipientB, payoutB);

        emit InvoicePaid(id, msg.sender, inv.amount, payoutA, payoutB);
    }

    /// @notice Cancel an open invoice (expired or not). Only the payer may cancel.
    function cancelInvoice(uint256 id) external {
        Invoice storage inv = _invoices[id];
        if (inv.status != Status.Open) revert InvoiceNotOpen();
        if (msg.sender != inv.payer) revert NotPayer();
        inv.status = Status.Cancelled;
        emit InvoiceCancelled(id, msg.sender);
    }

    /// @notice Read an invoice. Unknown ids return zero values with status 0 (None).
    function getInvoice(uint256 id)
        external
        view
        returns (
            address payer,
            address recipientA,
            address recipientB,
            uint256 amount,
            uint16 shareBps,
            uint64 expiry,
            uint8 status
        )
    {
        Invoice storage inv = _invoices[id];
        return (inv.payer, inv.recipientA, inv.recipientB, inv.amount, inv.shareBps, inv.expiry, uint8(inv.status));
    }

    /// @notice Exact payouts for a given amount and share: A rounds down, B takes the remainder.
    function previewPayouts(uint256 amount, uint16 shareBps) public pure returns (uint256 payoutA, uint256 payoutB) {
        payoutA = (amount * shareBps) / BPS_DENOMINATOR;
        payoutB = amount - payoutA;
    }
}
