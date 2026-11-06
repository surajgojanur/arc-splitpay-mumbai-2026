// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ArcSplit} from "../src/ArcSplit.sol";

/// @dev Simple 6-decimal ERC20 mock.
contract MockUSDC {
    string public name = "Mock USDC";
    string public symbol = "mUSDC";
    uint8 public decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amt) external {
        balanceOf[to] += amt;
        totalSupply += amt;
        emit Transfer(address(0), to, amt);
    }

    function approve(address spender, uint256 amt) external returns (bool) {
        allowance[msg.sender][spender] = amt;
        emit Approval(msg.sender, spender, amt);
        return true;
    }

    function transfer(address to, uint256 amt) external returns (bool) {
        _move(msg.sender, to, amt);
        return true;
    }

    function transferFrom(address from, address to, uint256 amt) external virtual returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amt, "allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amt;
        _move(from, to, amt);
        return true;
    }

    function _move(address from, address to, uint256 amt) internal virtual {
        require(balanceOf[from] >= amt, "balance");
        balanceOf[from] -= amt;
        balanceOf[to] += amt;
        emit Transfer(from, to, amt);
    }
}

/// @dev USDC-blocklist-style mock: transfers to a flagged address revert.
contract BlocklistUSDC is MockUSDC {
    mapping(address => bool) public blocked;

    function setBlocked(address a, bool b) external {
        blocked[a] = b;
    }

    function _move(address from, address to, uint256 amt) internal override {
        require(!blocked[to], "Blacklistable: account is blacklisted");
        super._move(from, to, amt);
    }
}

/// @dev Drives random create/settle/cancel/warp sequences for the zero-balance invariant.
contract SplitHandler is Test {
    ArcSplit public split;
    MockUSDC public usdc;
    address[5] public actors;

    constructor(ArcSplit _split, MockUSDC _usdc) {
        split = _split;
        usdc = _usdc;
        for (uint256 i; i < 5; i++) actors[i] = address(uint160(0xA000 + i));
    }

    function create(uint256 amount, uint256 bpsA, uint256 p, uint256 a, uint256 b) external {
        address payer = actors[p % 5];
        address ra = actors[a % 5];
        address rb = actors[b % 5];
        if (ra == rb) return;
        uint128 amt = uint128(bound(amount, 2, 1e15));
        uint16 bA = uint16(bound(bpsA, 1, 9999));
        usdc.mint(payer, amt);
        vm.prank(payer);
        usdc.approve(address(split), type(uint256).max);
        vm.prank(actors[(p + 1) % 5]);
        try split.createInvoice(payer, ra, rb, amt, bA, 10_000 - bA, uint64(block.timestamp + 1 days), bytes32(0)) {} catch {}
    }

    function settle(uint256 idSeed) external {
        uint256 last = split.nextInvoiceId() - 1;
        if (last == 0) return;
        uint256 id = bound(idSeed, 1, last);
        ArcSplit.Invoice memory inv = split.getInvoice(id);
        vm.prank(inv.payer);
        try split.settleInvoice(id) {} catch {}
    }

    function cancel(uint256 idSeed) external {
        uint256 last = split.nextInvoiceId() - 1;
        if (last == 0) return;
        uint256 id = bound(idSeed, 1, last);
        ArcSplit.Invoice memory inv = split.getInvoice(id);
        vm.prank(inv.creator);
        try split.cancelInvoice(id) {} catch {}
    }

    function warp(uint256 secs) external {
        skip(bound(secs, 0, 2 days));
    }
}

contract ArcSplitTest is Test {
    ArcSplit internal split;
    MockUSDC internal usdc;

    address internal creator = makeAddr("creator");
    address internal payer = makeAddr("payer");
    address internal recA = makeAddr("recipientA");
    address internal recB = makeAddr("recipientB");
    address internal stranger = makeAddr("stranger");

    uint128 internal constant AMT = 100e6;
    uint64 internal expiry;
    bytes32 internal constant REF = keccak256("invoice-ref");

    function setUp() public virtual {
        vm.warp(1_000_000);
        expiry = uint64(block.timestamp + 1 days);
        usdc = new MockUSDC();
        split = new ArcSplit(address(usdc));
        usdc.mint(payer, 1_000e6);
        vm.prank(payer);
        usdc.approve(address(split), type(uint256).max);
    }

    // ---------- helpers ----------
    function _create() internal returns (uint256) {
        return _createWith(AMT, 7000, 3000);
    }

    function _createWith(uint128 amt, uint16 bA, uint16 bB) internal returns (uint256 id) {
        vm.prank(creator);
        id = split.createInvoice(payer, recA, recB, amt, bA, bB, expiry, REF);
    }

    function _expectCreateRevert(bytes memory err, address p, address a, address b, uint128 amt, uint16 bA, uint16 bB, uint64 exp) internal {
        vm.expectRevert(err);
        vm.prank(creator);
        split.createInvoice(p, a, b, amt, bA, bB, exp, REF);
    }

    function _settle(uint256 id) internal {
        vm.prank(payer);
        split.settleInvoice(id);
    }

    function _status(uint256 id) internal view returns (ArcSplit.Status) {
        return split.getInvoice(id).status;
    }

    // ---------- constructor ----------
    function test_Constructor_StoresUsdc() public view {
        assertEq(address(split.usdc()), address(usdc));
        assertEq(split.nextInvoiceId(), 1);
        assertEq(split.BPS_DENOMINATOR(), 10_000);
    }

    function test_Constructor_RevertsOnZeroAddress() public {
        vm.expectRevert(abi.encodeWithSelector(ArcSplit.InvalidToken.selector, address(0)));
        new ArcSplit(address(0));
    }

    function test_Constructor_RevertsOnNoCodeAddress() public {
        address eoa = makeAddr("eoa");
        vm.expectRevert(abi.encodeWithSelector(ArcSplit.InvalidToken.selector, eoa));
        new ArcSplit(eoa);
    }

    // ---------- createInvoice happy path ----------
    function test_Create_HappyPathStoresStructAndEmits() public {
        vm.expectEmit(true, true, true, true, address(split));
        emit ArcSplit.InvoiceCreated(1, creator, payer, recA, recB, AMT, 7000, 3000, expiry, REF);
        uint256 id = _create();
        assertEq(id, 1);
        assertEq(split.nextInvoiceId(), 2);

        ArcSplit.Invoice memory inv = split.getInvoice(1);
        assertEq(inv.creator, creator);
        assertEq(inv.payer, payer);
        assertEq(inv.recipientA, recA);
        assertEq(inv.recipientB, recB);
        assertEq(inv.amount, AMT);
        assertEq(inv.bpsA, 7000);
        assertEq(inv.bpsB, 3000);
        assertEq(inv.expiry, expiry);
        assertEq(inv.createdAt, block.timestamp);
        assertEq(inv.paidAt, 0);
        assertEq(uint8(inv.status), uint8(ArcSplit.Status.Open));
        assertEq(inv.referenceHash, REF);
    }

    function test_Create_IdsIncrementFromOne() public {
        assertEq(_create(), 1);
        assertEq(_create(), 2);
        assertEq(_create(), 3);
        assertEq(split.nextInvoiceId(), 4);
    }

    function test_Create_CreatorIsMsgSender() public {
        vm.prank(stranger);
        uint256 id = split.createInvoice(payer, recA, recB, AMT, 5000, 5000, expiry, REF);
        assertEq(split.getInvoice(id).creator, stranger);
    }

    function test_Create_PayerMayBeRecipient() public {
        vm.prank(creator);
        uint256 id = split.createInvoice(payer, payer, recB, AMT, 5000, 5000, expiry, REF);
        assertEq(split.getInvoice(id).recipientA, payer);
    }

    // ---------- createInvoice invalid inputs ----------
    function test_Create_RevertsZeroPayer() public {
        _expectCreateRevert(abi.encodeWithSelector(ArcSplit.ZeroAddress.selector), address(0), recA, recB, AMT, 7000, 3000, expiry);
    }

    function test_Create_RevertsZeroRecipientA() public {
        _expectCreateRevert(abi.encodeWithSelector(ArcSplit.ZeroAddress.selector), payer, address(0), recB, AMT, 7000, 3000, expiry);
    }

    function test_Create_RevertsZeroRecipientB() public {
        _expectCreateRevert(abi.encodeWithSelector(ArcSplit.ZeroAddress.selector), payer, recA, address(0), AMT, 7000, 3000, expiry);
    }

    function test_Create_RevertsIdenticalRecipients() public {
        _expectCreateRevert(abi.encodeWithSelector(ArcSplit.IdenticalRecipients.selector), payer, recA, recA, AMT, 7000, 3000, expiry);
    }

    function test_Create_RevertsContractAsPayer() public {
        _expectCreateRevert(abi.encodeWithSelector(ArcSplit.ContractAddressNotAllowed.selector), address(split), recA, recB, AMT, 7000, 3000, expiry);
    }

    function test_Create_RevertsContractAsRecipientA() public {
        _expectCreateRevert(abi.encodeWithSelector(ArcSplit.ContractAddressNotAllowed.selector), payer, address(split), recB, AMT, 7000, 3000, expiry);
    }

    function test_Create_RevertsContractAsRecipientB() public {
        _expectCreateRevert(abi.encodeWithSelector(ArcSplit.ContractAddressNotAllowed.selector), payer, recA, address(split), AMT, 7000, 3000, expiry);
    }

    function test_Create_RevertsZeroAmount() public {
        _expectCreateRevert(abi.encodeWithSelector(ArcSplit.ZeroAmount.selector), payer, recA, recB, 0, 7000, 3000, expiry);
    }

    function test_Create_RevertsBpsAZero() public {
        _expectCreateRevert(abi.encodeWithSelector(ArcSplit.InvalidBasisPoints.selector), payer, recA, recB, AMT, 0, 10_000, expiry);
    }

    function test_Create_RevertsBpsBZero() public {
        _expectCreateRevert(abi.encodeWithSelector(ArcSplit.InvalidBasisPoints.selector), payer, recA, recB, AMT, 10_000, 0, expiry);
    }

    function test_Create_RevertsBpsSumUnder() public {
        _expectCreateRevert(abi.encodeWithSelector(ArcSplit.InvalidBasisPoints.selector), payer, recA, recB, AMT, 4000, 5999, expiry);
    }

    function test_Create_RevertsBpsSumOver() public {
        _expectCreateRevert(abi.encodeWithSelector(ArcSplit.InvalidBasisPoints.selector), payer, recA, recB, AMT, 5001, 5000, expiry);
    }

    function test_Create_RevertsBpsSumHugeNoOverflow() public {
        _expectCreateRevert(abi.encodeWithSelector(ArcSplit.InvalidBasisPoints.selector), payer, recA, recB, AMT, type(uint16).max, type(uint16).max, expiry);
    }

    function test_Create_RevertsExpiryEqualsNow() public {
        _expectCreateRevert(abi.encodeWithSelector(ArcSplit.InvalidExpiry.selector), payer, recA, recB, AMT, 7000, 3000, uint64(block.timestamp));
    }

    function test_Create_RevertsExpiryInPast() public {
        _expectCreateRevert(abi.encodeWithSelector(ArcSplit.InvalidExpiry.selector), payer, recA, recB, AMT, 7000, 3000, uint64(block.timestamp - 1));
    }

    function test_Create_ExpiryNowPlusOneAllowed() public {
        vm.prank(creator);
        uint256 id = split.createInvoice(payer, recA, recB, AMT, 7000, 3000, uint64(block.timestamp + 1), REF);
        assertEq(id, 1);
    }

    function test_Create_RevertsZeroPayoutAmountOne() public {
        _expectCreateRevert(abi.encodeWithSelector(ArcSplit.ZeroPayout.selector), payer, recA, recB, 1, 5000, 5000, expiry);
    }

    function test_Create_RevertsZeroPayoutThreeUnits3333() public {
        // floor(3 * 3333 / 10000) == 0 -> A would be paid nothing
        _expectCreateRevert(abi.encodeWithSelector(ArcSplit.ZeroPayout.selector), payer, recA, recB, 3, 3333, 6667, expiry);
    }

    function test_Create_FailedCreateDoesNotConsumeId() public {
        _expectCreateRevert(abi.encodeWithSelector(ArcSplit.ZeroAmount.selector), payer, recA, recB, 0, 7000, 3000, expiry);
        assertEq(split.nextInvoiceId(), 1);
        assertEq(_create(), 1);
    }

    // ---------- settle happy path ----------
    function test_Settle_HappyPath7030() public {
        uint256 id = _create();
        uint256 payerBefore = usdc.balanceOf(payer);

        vm.expectEmit(true, true, false, true, address(split));
        emit ArcSplit.InvoicePaid(id, payer, recA, recB, 70e6, 30e6, AMT);
        _settle(id);

        assertEq(usdc.balanceOf(recA), 70e6);
        assertEq(usdc.balanceOf(recB), 30e6);
        assertEq(usdc.balanceOf(payer), payerBefore - AMT);
        assertEq(usdc.balanceOf(address(split)), 0);
        ArcSplit.Invoice memory inv = split.getInvoice(id);
        assertEq(uint8(inv.status), uint8(ArcSplit.Status.Paid));
        assertEq(inv.paidAt, block.timestamp);
    }

    function test_Settle_PaidAtIsSettlementTime() public {
        uint256 id = _create();
        skip(1 hours);
        _settle(id);
        assertEq(split.getInvoice(id).paidAt, block.timestamp);
    }

    // ---------- settle access / state ----------
    function test_Settle_RevertsForRecipient() public {
        uint256 id = _create();
        vm.expectRevert(ArcSplit.NotPayer.selector);
        vm.prank(recA);
        split.settleInvoice(id);
    }

    function test_Settle_RevertsForCreator() public {
        uint256 id = _create();
        vm.expectRevert(ArcSplit.NotPayer.selector);
        vm.prank(creator);
        split.settleInvoice(id);
    }

    function test_Settle_RevertsForRandom() public {
        uint256 id = _create();
        vm.expectRevert(ArcSplit.NotPayer.selector);
        vm.prank(stranger);
        split.settleInvoice(id);
    }

    function test_Settle_RevertsWithoutAllowance() public {
        uint256 id = _create();
        vm.prank(payer);
        usdc.approve(address(split), 0);
        vm.expectRevert(abi.encodeWithSelector(ArcSplit.InsufficientAllowance.selector, 0, AMT));
        _settle(id);
        assertEq(uint8(_status(id)), uint8(ArcSplit.Status.Open));
    }

    function test_Settle_RevertsWithInsufficientAllowance() public {
        uint256 id = _create();
        vm.prank(payer);
        usdc.approve(address(split), AMT - 1);
        vm.expectRevert(abi.encodeWithSelector(ArcSplit.InsufficientAllowance.selector, AMT - 1, AMT));
        _settle(id);
    }

    function test_Settle_ExactAllowanceSucceeds() public {
        uint256 id = _create();
        vm.prank(payer);
        usdc.approve(address(split), AMT);
        _settle(id);
        assertEq(usdc.allowance(payer, address(split)), 0);
    }

    function test_Settle_RevertsInsufficientBalanceAndStaysOpen() public {
        address poor = makeAddr("poor");
        usdc.mint(poor, 50e6);
        vm.prank(poor);
        usdc.approve(address(split), type(uint256).max);
        vm.prank(creator);
        uint256 id = split.createInvoice(poor, recA, recB, AMT, 7000, 3000, expiry, REF);

        vm.expectRevert();
        vm.prank(poor);
        split.settleInvoice(id);

        assertEq(uint8(_status(id)), uint8(ArcSplit.Status.Open));
        assertEq(split.getInvoice(id).paidAt, 0);
        assertEq(usdc.balanceOf(poor), 50e6);
        assertEq(usdc.balanceOf(recA), 0);
        assertEq(usdc.balanceOf(recB), 0);
    }

    function test_Settle_DoubleSettleReverts() public {
        uint256 id = _create();
        _settle(id);
        vm.expectRevert(abi.encodeWithSelector(ArcSplit.InvoiceNotOpen.selector, ArcSplit.Status.Paid));
        _settle(id);
        assertEq(usdc.balanceOf(recA), 70e6);
    }

    function test_Settle_AfterCancelReverts() public {
        uint256 id = _create();
        vm.prank(creator);
        split.cancelInvoice(id);
        vm.expectRevert(abi.encodeWithSelector(ArcSplit.InvoiceNotOpen.selector, ArcSplit.Status.Cancelled));
        _settle(id);
    }

    function test_Settle_AfterExpiryReverts() public {
        uint256 id = _create();
        vm.warp(expiry + 1);
        vm.expectRevert(ArcSplit.InvoiceExpired.selector);
        _settle(id);
        assertEq(uint8(_status(id)), uint8(ArcSplit.Status.Open));
    }

    function test_Settle_ExactlyAtExpirySucceeds() public {
        uint256 id = _create();
        vm.warp(expiry);
        assertFalse(split.isExpired(id));
        _settle(id);
        assertEq(uint8(_status(id)), uint8(ArcSplit.Status.Paid));
    }

    function test_IsExpired_TrueAfterExpiry() public {
        uint256 id = _create();
        assertFalse(split.isExpired(id));
        vm.warp(expiry + 1);
        assertTrue(split.isExpired(id));
    }

    // ---------- cancel ----------
    function test_Cancel_ByCreator() public {
        uint256 id = _create();
        vm.expectEmit(true, true, false, false, address(split));
        emit ArcSplit.InvoiceCancelled(id, creator);
        vm.prank(creator);
        split.cancelInvoice(id);
        assertEq(uint8(_status(id)), uint8(ArcSplit.Status.Cancelled));
    }

    function test_Cancel_ByPayer() public {
        uint256 id = _create();
        vm.expectEmit(true, true, false, false, address(split));
        emit ArcSplit.InvoiceCancelled(id, payer);
        vm.prank(payer);
        split.cancelInvoice(id);
        assertEq(uint8(_status(id)), uint8(ArcSplit.Status.Cancelled));
    }

    function test_Cancel_ByStrangerReverts() public {
        uint256 id = _create();
        vm.expectRevert(ArcSplit.NotAuthorized.selector);
        vm.prank(stranger);
        split.cancelInvoice(id);
        assertEq(uint8(_status(id)), uint8(ArcSplit.Status.Open));
    }

    function test_Cancel_ByRecipientReverts() public {
        uint256 id = _create();
        vm.expectRevert(ArcSplit.NotAuthorized.selector);
        vm.prank(recA);
        split.cancelInvoice(id);
    }

    function test_Cancel_AfterPaidReverts() public {
        uint256 id = _create();
        _settle(id);
        vm.expectRevert(abi.encodeWithSelector(ArcSplit.InvoiceNotOpen.selector, ArcSplit.Status.Paid));
        vm.prank(creator);
        split.cancelInvoice(id);
    }

    function test_Cancel_DoubleCancelReverts() public {
        uint256 id = _create();
        vm.prank(creator);
        split.cancelInvoice(id);
        vm.expectRevert(abi.encodeWithSelector(ArcSplit.InvoiceNotOpen.selector, ArcSplit.Status.Cancelled));
        vm.prank(payer);
        split.cancelInvoice(id);
    }

    function test_Cancel_AfterExpiryAllowed() public {
        uint256 id = _create();
        vm.warp(expiry + 1 days);
        vm.prank(creator);
        split.cancelInvoice(id);
        assertEq(uint8(_status(id)), uint8(ArcSplit.Status.Cancelled));
    }

    // ---------- nonexistent ids ----------
    function test_NonexistentId_AllRevertInvoiceNotFound() public {
        bytes memory err = abi.encodeWithSelector(ArcSplit.InvoiceNotFound.selector, 1);
        vm.expectRevert(err);
        split.getInvoice(1);
        vm.expectRevert(err);
        _settle(1);
        vm.expectRevert(err);
        vm.prank(creator);
        split.cancelInvoice(1);
        vm.expectRevert(err);
        split.payoutsOf(1);
        vm.expectRevert(err);
        split.isExpired(1);
    }

    function test_NonexistentId_ZeroAndBeyondNext() public {
        _create();
        vm.expectRevert(abi.encodeWithSelector(ArcSplit.InvoiceNotFound.selector, 0));
        split.getInvoice(0);
        vm.expectRevert(abi.encodeWithSelector(ArcSplit.InvoiceNotFound.selector, 2));
        split.getInvoice(2);
    }

    // ---------- payouts / rounding ----------
    function test_PayoutsOf_7030() public {
        uint256 id = _create();
        (uint256 a, uint256 b) = split.payoutsOf(id);
        assertEq(a, 70e6);
        assertEq(b, 30e6);
    }

    function test_PreviewPayouts_RevertsBpsAbove10000() public {
        vm.expectRevert(ArcSplit.InvalidBasisPoints.selector);
        split.previewPayouts(100, 10_001);
    }

    function test_Rounding_1000001_At3333_6667() public {
        uint256 id = _createWith(1_000_001, 3333, 6667);
        (uint256 a, uint256 b) = split.payoutsOf(id);
        assertEq(a, 333_300); // floor
        assertEq(b, 666_701); // remainder to B
        assertEq(a + b, 1_000_001);
        usdc.mint(payer, 1_000_001);
        _settle(id);
        assertEq(usdc.balanceOf(recA), 333_300);
        assertEq(usdc.balanceOf(recB), 666_701);
        assertEq(usdc.balanceOf(address(split)), 0);
    }

    function test_Rounding_ThreeUnits6667_3333_Conserves() public {
        uint256 id = _createWith(3, 6667, 3333);
        (uint256 a, uint256 b) = split.payoutsOf(id);
        assertEq(a, 2);
        assertEq(b, 1);
        _settle(id);
        assertEq(usdc.balanceOf(recA) + usdc.balanceOf(recB), 3);
    }

    function test_Rounding_ThreeUnits5000_Conserves() public {
        uint256 id = _createWith(3, 5000, 5000);
        (uint256 a, uint256 b) = split.payoutsOf(id);
        assertEq(a, 1);
        assertEq(b, 2);
    }

    // ---------- blocklist ----------
    function test_Settle_BlocklistedRecipientBRevertsAtomically() public {
        BlocklistUSDC bl = new BlocklistUSDC();
        ArcSplit s = new ArcSplit(address(bl));
        bl.mint(payer, 1_000e6);
        vm.prank(payer);
        bl.approve(address(s), type(uint256).max);
        vm.prank(creator);
        uint256 id = s.createInvoice(payer, recA, recB, AMT, 7000, 3000, expiry, REF);

        bl.setBlocked(recB, true);
        vm.expectRevert(bytes("Blacklistable: account is blacklisted"));
        vm.prank(payer);
        s.settleInvoice(id);

        assertEq(bl.balanceOf(recA), 0, "A must not be paid");
        assertEq(bl.balanceOf(recB), 0);
        assertEq(bl.balanceOf(payer), 1_000e6);
        assertEq(uint8(s.getInvoice(id).status), uint8(ArcSplit.Status.Open));
        assertEq(s.getInvoice(id).paidAt, 0);

        // payer can cancel the stuck invoice, and unblocking lets a fresh one settle
        vm.prank(payer);
        s.cancelInvoice(id);
        assertEq(uint8(s.getInvoice(id).status), uint8(ArcSplit.Status.Cancelled));
    }

    function test_Settle_BlocklistedRecipientARevertsAndLaterSucceedsWhenUnblocked() public {
        BlocklistUSDC bl = new BlocklistUSDC();
        ArcSplit s = new ArcSplit(address(bl));
        bl.mint(payer, 1_000e6);
        vm.prank(payer);
        bl.approve(address(s), type(uint256).max);
        vm.prank(creator);
        uint256 id = s.createInvoice(payer, recA, recB, AMT, 7000, 3000, expiry, REF);

        bl.setBlocked(recA, true);
        vm.expectRevert(bytes("Blacklistable: account is blacklisted"));
        vm.prank(payer);
        s.settleInvoice(id);
        assertEq(uint8(s.getInvoice(id).status), uint8(ArcSplit.Status.Open));

        bl.setBlocked(recA, false);
        vm.prank(payer);
        s.settleInvoice(id);
        assertEq(bl.balanceOf(recA), 70e6);
        assertEq(bl.balanceOf(recB), 30e6);
    }

    // ---------- fuzz ----------
    function testFuzz_SettleConservesAndLeavesContractEmpty(uint128 amount, uint16 bpsA) public {
        amount = uint128(bound(amount, 2, type(uint128).max));
        bpsA = uint16(bound(bpsA, 1, 9999));
        (uint256 pA, uint256 pB) = split.previewPayouts(amount, bpsA);
        vm.assume(pA > 0 && pB > 0);
        assertEq(pA + pB, amount);

        usdc.mint(payer, amount);
        uint256 payerBefore = usdc.balanceOf(payer);
        uint256 id = _createWith(amount, bpsA, 10_000 - bpsA);
        (uint256 qA, uint256 qB) = split.payoutsOf(id);
        assertEq(qA, pA);
        assertEq(qB, pB);

        _settle(id);

        assertEq(usdc.balanceOf(recA), pA);
        assertEq(usdc.balanceOf(recB), pB);
        assertEq(payerBefore - usdc.balanceOf(payer), amount);
        assertEq(usdc.balanceOf(address(split)), 0);
        assertEq(uint8(_status(id)), uint8(ArcSplit.Status.Paid));
    }

    function testFuzz_ContractBalanceAlwaysZeroAcrossSettleAndCancel(uint128 amount, uint16 bpsA, bool doSettle) public {
        amount = uint128(bound(amount, 2, 1e30));
        bpsA = uint16(bound(bpsA, 1, 9999));
        (uint256 pA, uint256 pB) = split.previewPayouts(amount, bpsA);
        vm.assume(pA > 0 && pB > 0);
        usdc.mint(payer, amount);
        uint256 id = _createWith(amount, bpsA, 10_000 - bpsA);
        assertEq(usdc.balanceOf(address(split)), 0);
        if (doSettle) {
            _settle(id);
        } else {
            vm.prank(payer);
            split.cancelInvoice(id);
        }
        assertEq(usdc.balanceOf(address(split)), 0);
    }
}

/// @dev Stateful invariant: ArcSplit never custodies USDC.
contract ArcSplitInvariantTest is Test {
    ArcSplit internal split;
    MockUSDC internal usdc;
    SplitHandler internal handler;

    function setUp() public {
        vm.warp(1_000_000);
        usdc = new MockUSDC();
        split = new ArcSplit(address(usdc));
        handler = new SplitHandler(split, usdc);
        targetContract(address(handler));
    }

    function invariant_ContractUsdcBalanceIsZero() public view {
        assertEq(usdc.balanceOf(address(split)), 0);
    }

    function invariant_PaidInvoicesSettledWithinExpiry() public view {
        uint256 last = split.nextInvoiceId() - 1;
        for (uint256 id = 1; id <= last; id++) {
            ArcSplit.Invoice memory inv = split.getInvoice(id);
            if (inv.status == ArcSplit.Status.Paid) {
                assertGt(inv.paidAt, 0);
                assertLe(inv.paidAt, inv.expiry);
            } else {
                assertEq(inv.paidAt, 0);
            }
        }
    }
}
