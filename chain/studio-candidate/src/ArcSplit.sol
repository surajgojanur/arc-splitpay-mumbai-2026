// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ArcSplit — atomic, non-custodial two-recipient USDC invoices
/// @notice Arc's USDC ERC-20 view uses 6 decimals. Supply its address at deployment.
/// @dev Never custodies funds: both transfers go directly from payer to recipients.
/// A USDC-blocklisted payer or recipient makes settlement revert; the payer may cancel.
/// Recipient A receives the floored share; B receives the remainder, conserving amount.
contract ArcSplit {
    using SafeERC20 for IERC20;

    // Arc Testnet official USDC ERC-20. Keep this private to preserve the Studio ABI.
    address private constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;
    uint8 private constant USDC_DECIMALS = 6;
    bool private _entered;

    uint256 public constant BPS_DENOMINATOR = 10_000;
    IERC20 public immutable usdc;
    uint256 public nextInvoiceId = 1;

    enum Status {
        None,
        Open,
        Paid,
        Cancelled
    }

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

    mapping(uint256 => Invoice) private invoices;

    error InvalidToken(address token);
    error ZeroAddress();
    error ContractAddressNotAllowed();
    error IdenticalRecipients();
    error ZeroAmount();
    error InvalidBasisPoints();
    error InvalidExpiry();
    error ZeroPayout();
    error InvoiceNotFound(uint256 id);
    error NotPayer();
    error NotAuthorized();
    error InvoiceNotOpen(Status currentStatus);
    error InvoiceExpired();
    error InsufficientAllowance(uint256 allowance, uint256 amount);

    modifier nonReentrant() {
        // An empty revert keeps the preserved Studio custom-error ABI unchanged.
        if (_entered) assembly ("memory-safe") { revert(0, 0) }
        _entered = true;
        _;
        _entered = false;
    }

    event InvoiceCreated(
        uint256 indexed id,
        address indexed creator,
        address indexed payer,
        address recipientA,
        address recipientB,
        uint256 amount,
        uint16 bpsA,
        uint16 bpsB,
        uint64 expiry,
        bytes32 referenceHash
    );
    event InvoicePaid(
        uint256 indexed id,
        address indexed payer,
        address recipientA,
        address recipientB,
        uint256 payoutA,
        uint256 payoutB,
        uint256 amount
    );
    event InvoiceCancelled(uint256 indexed id, address indexed cancelledBy);

    /// @notice Selects the USDC interface; rejects zero and addresses without code.
    constructor(address usdcAddress) {
        if (usdcAddress != ARC_TESTNET_USDC || usdcAddress.code.length == 0) {
            revert InvalidToken(usdcAddress);
        }
        uint8 decimals;
        try IERC20Metadata(usdcAddress).decimals() returns (uint8 value) {
            decimals = value;
        } catch {
            revert InvalidToken(usdcAddress);
        }
        if (decimals != USDC_DECIMALS) revert InvalidToken(usdcAddress);
        usdc = IERC20(usdcAddress);
    }

    /// @notice Creates an invoice in USDC base units; payer may be a recipient.
    /// @dev Both shares must be positive. Expiry is the last valid settlement second.
    /// The referenceHash parameter is opaque caller-supplied invoice metadata.
    function createInvoice(
        address payer,
        address recipientA,
        address recipientB,
        uint128 amount,
        uint16 bpsA,
        uint16 bpsB,
        uint64 expiry,
        bytes32 referenceHash
    ) external nonReentrant returns (uint256 id) {
        if (payer == address(0) || recipientA == address(0) || recipientB == address(0)) {
            revert ZeroAddress();
        }
        if (payer == address(this) || recipientA == address(this) || recipientB == address(this)) {
            revert ContractAddressNotAllowed();
        }
        if (recipientA == recipientB) revert IdenticalRecipients();
        if (amount == 0) revert ZeroAmount();
        if (bpsA == 0 || bpsB == 0 || uint256(bpsA) + bpsB != BPS_DENOMINATOR) {
            revert InvalidBasisPoints();
        }
        if (expiry <= block.timestamp) revert InvalidExpiry();
        (uint256 payoutA, uint256 payoutB) = previewPayouts(amount, bpsA);
        if (payoutA == 0 || payoutB == 0) revert ZeroPayout();

        id = nextInvoiceId++;
        Invoice storage invoice = invoices[id];
        invoice.creator = msg.sender;
        invoice.payer = payer;
        invoice.recipientA = recipientA;
        invoice.recipientB = recipientB;
        invoice.amount = amount;
        invoice.bpsA = bpsA;
        invoice.bpsB = bpsB;
        invoice.expiry = expiry;
        invoice.createdAt = uint64(block.timestamp);
        invoice.status = Status.Open;
        invoice.referenceHash = referenceHash;
        _emitInvoiceCreated(id, invoice);
    }

    /// @notice Returns an existing invoice, including its stored status and timestamps.
    function getInvoice(uint256 id) external view returns (Invoice memory) {
        return _invoice(id);
    }

    /// @notice Returns whether an existing invoice's deadline has passed, regardless of status.
    function isExpired(uint256 id) external view returns (bool) {
        return block.timestamp > _invoice(id).expiry;
    }

    /// @notice Floors A's share and assigns the entire remainder to B.
    /// @dev Accepts bpsA from zero through 10,000; payouts always sum to amount.
    function previewPayouts(uint128 amount, uint16 bpsA) public pure returns (uint256 payoutA, uint256 payoutB) {
        if (bpsA > BPS_DENOMINATOR) revert InvalidBasisPoints();
        payoutA = uint256(amount) * bpsA / BPS_DENOMINATOR;
        payoutB = uint256(amount) - payoutA;
    }

    /// @notice Returns the exact two payouts for an existing invoice.
    function payoutsOf(uint256 id) external view returns (uint256 payoutA, uint256 payoutB) {
        Invoice storage invoice = _invoice(id);
        return previewPayouts(invoice.amount, invoice.bpsA);
    }

    /// @notice Pays an open invoice directly to both recipients using the payer's allowance.
    /// @dev Valid through expiry inclusively; any transfer failure rolls back all effects.
    function settleInvoice(uint256 id) external nonReentrant {
        Invoice storage invoice = _invoice(id);
        if (msg.sender != invoice.payer) revert NotPayer();
        if (invoice.status != Status.Open) revert InvoiceNotOpen(invoice.status);
        if (block.timestamp > invoice.expiry) revert InvoiceExpired();
        uint256 allowed = usdc.allowance(invoice.payer, address(this));
        if (allowed < invoice.amount) revert InsufficientAllowance(allowed, invoice.amount);
        (uint256 payoutA, uint256 payoutB) = previewPayouts(invoice.amount, invoice.bpsA);

        invoice.status = Status.Paid;
        invoice.paidAt = uint64(block.timestamp);
        usdc.safeTransferFrom(invoice.payer, invoice.recipientA, payoutA);
        usdc.safeTransferFrom(invoice.payer, invoice.recipientB, payoutB);
        emit InvoicePaid(id, invoice.payer, invoice.recipientA, invoice.recipientB, payoutA, payoutB, invoice.amount);
    }

    /// @notice Lets the creator or payer cancel an open invoice, including after expiry.
    function cancelInvoice(uint256 id) external nonReentrant {
        Invoice storage invoice = _invoice(id);
        if (msg.sender != invoice.creator && msg.sender != invoice.payer) revert NotAuthorized();
        if (invoice.status != Status.Open) revert InvoiceNotOpen(invoice.status);
        invoice.status = Status.Cancelled;
        emit InvoiceCancelled(id, msg.sender);
    }

    function _invoice(uint256 id) private view returns (Invoice storage invoice) {
        invoice = invoices[id];
        if (invoice.status == Status.None) revert InvoiceNotFound(id);
    }

    function _emitInvoiceCreated(uint256 id, Invoice storage invoice) private {
        emit InvoiceCreated(
            id,
            invoice.creator,
            invoice.payer,
            invoice.recipientA,
            invoice.recipientB,
            invoice.amount,
            invoice.bpsA,
            invoice.bpsB,
            invoice.expiry,
            invoice.referenceHash
        );
    }
}
