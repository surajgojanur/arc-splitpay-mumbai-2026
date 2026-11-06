// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, Vm} from "forge-std/Test.sol";
import {ArcSplit} from "../src/ArcSplit.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MockUSDC, Mock18, FalseReturnToken, BlockingToken, ReentrantToken} from "./mocks/Mocks.sol";

contract ArcSplitTest is Test {
    ArcSplit internal split;
    MockUSDC internal usdc;

    address internal payer = makeAddr("payer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal mallory = makeAddr("mallory");

    uint256 internal constant ONE = 1e6; // 1 USDC
    uint256 internal constant HUNDRED = 100 * ONE;
    uint16 internal constant SHARE_70 = 7_000;
    uint64 internal expiry;

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

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new MockUSDC();
        split = new ArcSplit(address(usdc));
        expiry = uint64(block.timestamp + 1 days);
        usdc.mint(payer, 1_000 * ONE);
    }

    function _create() internal returns (uint256) {
        vm.prank(payer);
        return split.createInvoice(alice, bob, HUNDRED, SHARE_70, expiry);
    }

    function _approveAndPay(uint256 id, uint256 allowance) internal {
        vm.startPrank(payer);
        usdc.approve(address(split), allowance);
        split.payInvoice(id);
        vm.stopPrank();
    }

    // ───────────────────────── constructor ─────────────────────────

    function test_constructor_setsUsdc() public view {
        assertEq(address(split.usdc()), address(usdc));
        assertEq(split.invoiceCount(), 0);
    }

    function test_constructor_rejectsEOA() public {
        vm.expectRevert(ArcSplit.InvalidToken.selector);
        new ArcSplit(makeAddr("eoa"));
    }

    function test_constructor_rejectsWrongDecimals() public {
        Mock18 t = new Mock18();
        vm.expectRevert(ArcSplit.InvalidToken.selector);
        new ArcSplit(address(t));
    }

    // ───────────────────────── create ─────────────────────────

    function test_create_storesInvoiceAndEmits() public {
        vm.expectEmit(true, true, false, true, address(split));
        emit InvoiceCreated(1, payer, alice, bob, HUNDRED, SHARE_70, expiry);
        uint256 id = _create();

        assertEq(id, 1);
        assertEq(split.invoiceCount(), 1);
        (address p, address a, address b, uint256 amt, uint16 bps, uint64 exp, uint8 st) = split.getInvoice(id);
        assertEq(p, payer);
        assertEq(a, alice);
        assertEq(b, bob);
        assertEq(amt, HUNDRED);
        assertEq(bps, SHARE_70);
        assertEq(exp, expiry);
        assertEq(st, uint8(ArcSplit.Status.Open));
    }

    function test_create_sequentialIds() public {
        assertEq(_create(), 1);
        assertEq(_create(), 2);
        vm.prank(mallory);
        assertEq(split.createInvoice(alice, bob, ONE, 5_000, expiry), 3);
    }

    function test_create_doesNotMoveFunds() public {
        _create();
        assertEq(usdc.balanceOf(payer), 1_000 * ONE);
        assertEq(usdc.balanceOf(address(split)), 0);
    }

    function test_getInvoice_unknownIdIsNone() public view {
        (address p,,, uint256 amt,,, uint8 st) = split.getInvoice(42);
        assertEq(p, address(0));
        assertEq(amt, 0);
        assertEq(st, uint8(ArcSplit.Status.None));
    }

    function test_create_revertsZeroAmount() public {
        vm.prank(payer);
        vm.expectRevert(ArcSplit.InvalidAmount.selector);
        split.createInvoice(alice, bob, 0, SHARE_70, expiry);
    }

    function test_create_revertsZeroRecipientA() public {
        vm.prank(payer);
        vm.expectRevert(ArcSplit.InvalidRecipient.selector);
        split.createInvoice(address(0), bob, HUNDRED, SHARE_70, expiry);
    }

    function test_create_revertsZeroRecipientB() public {
        vm.prank(payer);
        vm.expectRevert(ArcSplit.InvalidRecipient.selector);
        split.createInvoice(alice, address(0), HUNDRED, SHARE_70, expiry);
    }

    function test_create_revertsSameRecipients() public {
        vm.prank(payer);
        vm.expectRevert(ArcSplit.InvalidRecipient.selector);
        split.createInvoice(alice, alice, HUNDRED, SHARE_70, expiry);
    }

    function test_create_revertsShareZero() public {
        vm.prank(payer);
        vm.expectRevert(ArcSplit.InvalidShare.selector);
        split.createInvoice(alice, bob, HUNDRED, 0, expiry);
    }

    function test_create_revertsShareFull() public {
        vm.prank(payer);
        vm.expectRevert(ArcSplit.InvalidShare.selector);
        split.createInvoice(alice, bob, HUNDRED, 10_000, expiry);
    }

    function test_create_revertsShareAboveFull() public {
        vm.prank(payer);
        vm.expectRevert(ArcSplit.InvalidShare.selector);
        split.createInvoice(alice, bob, HUNDRED, 10_001, expiry);
    }

    function test_create_revertsExpiryNow() public {
        vm.prank(payer);
        vm.expectRevert(ArcSplit.InvalidExpiry.selector);
        split.createInvoice(alice, bob, HUNDRED, SHARE_70, uint64(block.timestamp));
    }

    function test_create_revertsExpiryPast() public {
        vm.prank(payer);
        vm.expectRevert(ArcSplit.InvalidExpiry.selector);
        split.createInvoice(alice, bob, HUNDRED, SHARE_70, uint64(block.timestamp - 1));
    }

    /// 1 atomic unit at 70% would pay A zero — rejected rather than silently creating a one-sided "split".
    function test_create_revertsWhenPayoutARoundsToZero() public {
        vm.prank(payer);
        vm.expectRevert(ArcSplit.InvalidAmount.selector);
        split.createInvoice(alice, bob, 1, SHARE_70, expiry);
    }

    /// 2 units at 99.99%: A = floor(19998/10000) = 1, B = 1. Smallest valid two-way split.
    function test_create_smallestUnitSplitAccepted() public {
        vm.prank(payer);
        uint256 id = split.createInvoice(alice, bob, 2, 9_999, expiry);
        _approveAndPay(id, 2);
        assertEq(usdc.balanceOf(alice), 1);
        assertEq(usdc.balanceOf(bob), 1);
    }

    function test_create_overflowAmountReverts() public {
        vm.prank(payer);
        vm.expectRevert(); // checked arithmetic panic in amount * shareBps
        split.createInvoice(alice, bob, type(uint256).max, SHARE_70, expiry);
    }

    // ───────────────────────── pay ─────────────────────────

    function test_pay_splits70_30() public {
        uint256 id = _create();
        _approveAndPay(id, HUNDRED);

        assertEq(usdc.balanceOf(alice), 70 * ONE);
        assertEq(usdc.balanceOf(bob), 30 * ONE);
        assertEq(usdc.balanceOf(payer), 900 * ONE);
        assertEq(usdc.balanceOf(address(split)), 0);
        assertEq(usdc.allowance(payer, address(split)), 0);
        (,,,,,, uint8 st) = split.getInvoice(id);
        assertEq(st, uint8(ArcSplit.Status.Paid));
    }

    function test_pay_emitsInvoicePaid() public {
        uint256 id = _create();
        vm.startPrank(payer);
        usdc.approve(address(split), HUNDRED);
        vm.expectEmit(true, true, false, true, address(split));
        emit InvoicePaid(id, payer, HUNDRED, 70 * ONE, 30 * ONE);
        split.payInvoice(id);
        vm.stopPrank();
    }

    function test_pay_emitsTwoTransfersFromPayer() public {
        uint256 id = _create();
        vm.prank(payer);
        usdc.approve(address(split), HUNDRED);
        vm.recordLogs();
        vm.prank(payer);
        split.payInvoice(id);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 transferSig = keccak256("Transfer(address,address,uint256)");
        uint256 seen;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == address(usdc) && logs[i].topics[0] == transferSig) {
                assertEq(address(uint160(uint256(logs[i].topics[1]))), payer);
                seen++;
            }
        }
        assertEq(seen, 2);
    }

    function test_pay_roundingRemainderToB() public {
        // 10.000001 USDC at 33.33%: A = floor(10000001*3333/10000) = 3333000, B = 6667001
        vm.prank(payer);
        uint256 id = split.createInvoice(alice, bob, 10_000_001, 3_333, expiry);
        _approveAndPay(id, 10_000_001);
        assertEq(usdc.balanceOf(alice), 3_333_000);
        assertEq(usdc.balanceOf(bob), 6_667_001);
    }

    function test_pay_allowsJustBeforeExpiry() public {
        uint256 id = _create();
        vm.warp(expiry - 1);
        _approveAndPay(id, HUNDRED);
        (,,,,,, uint8 st) = split.getInvoice(id);
        assertEq(st, uint8(ArcSplit.Status.Paid));
    }

    function test_pay_revertsAtExpiry() public {
        uint256 id = _create();
        vm.warp(expiry);
        vm.startPrank(payer);
        usdc.approve(address(split), HUNDRED);
        vm.expectRevert(ArcSplit.InvoiceExpired.selector);
        split.payInvoice(id);
        vm.stopPrank();
    }

    function test_pay_revertsAfterExpiry() public {
        uint256 id = _create();
        vm.warp(expiry + 1 days);
        vm.startPrank(payer);
        usdc.approve(address(split), HUNDRED);
        vm.expectRevert(ArcSplit.InvoiceExpired.selector);
        split.payInvoice(id);
        vm.stopPrank();
    }

    function test_pay_revertsUnauthorized() public {
        uint256 id = _create();
        usdc.mint(mallory, HUNDRED);
        vm.startPrank(mallory);
        usdc.approve(address(split), HUNDRED);
        vm.expectRevert(ArcSplit.NotPayer.selector);
        split.payInvoice(id);
        vm.stopPrank();
    }

    function test_pay_recipientCannotPay() public {
        uint256 id = _create();
        vm.prank(alice);
        vm.expectRevert(ArcSplit.NotPayer.selector);
        split.payInvoice(id);
    }

    function test_pay_revertsUnknownId() public {
        vm.prank(payer);
        vm.expectRevert(ArcSplit.InvoiceNotOpen.selector);
        split.payInvoice(99);
    }

    function test_pay_revertsDuplicate() public {
        uint256 id = _create();
        _approveAndPay(id, 2 * HUNDRED); // leftover allowance must not allow a second settlement
        vm.prank(payer);
        vm.expectRevert(ArcSplit.InvoiceNotOpen.selector);
        split.payInvoice(id);
        assertEq(usdc.balanceOf(alice), 70 * ONE);
        assertEq(usdc.balanceOf(bob), 30 * ONE);
    }

    function test_pay_revertsInsufficientAllowance() public {
        uint256 id = _create();
        vm.startPrank(payer);
        usdc.approve(address(split), HUNDRED - 1);
        // A's 70 USDC succeeds against the allowance, B's 30 fails → whole tx reverts.
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(split), HUNDRED - 1 - 70 * ONE, 30 * ONE
            )
        );
        split.payInvoice(id);
        vm.stopPrank();
        _assertUnpaidAndUntouched(id, 1_000 * ONE);
    }

    function test_pay_revertsNoAllowance() public {
        uint256 id = _create();
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(split), 0, 70 * ONE)
        );
        split.payInvoice(id);
        _assertUnpaidAndUntouched(id, 1_000 * ONE);
    }

    function test_pay_revertsInsufficientBalance() public {
        address poor = makeAddr("poor");
        usdc.mint(poor, 80 * ONE);
        vm.startPrank(poor);
        uint256 id = split.createInvoice(alice, bob, HUNDRED, SHARE_70, expiry);
        usdc.approve(address(split), HUNDRED);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, poor, 10 * ONE, 30 * ONE)
        );
        split.payInvoice(id);
        vm.stopPrank();
        assertEq(usdc.balanceOf(poor), 80 * ONE, "first transfer rolled back");
        assertEq(usdc.balanceOf(alice), 0);
        (,,,,,, uint8 st) = split.getInvoice(id);
        assertEq(st, uint8(ArcSplit.Status.Open));
    }

    function test_pay_revertsAfterCancel() public {
        uint256 id = _create();
        vm.prank(payer);
        split.cancelInvoice(id);
        vm.startPrank(payer);
        usdc.approve(address(split), HUNDRED);
        vm.expectRevert(ArcSplit.InvoiceNotOpen.selector);
        split.payInvoice(id);
        vm.stopPrank();
    }

    function test_pay_independentInvoices() public {
        uint256 a = _create();
        uint256 b = _create();
        _approveAndPay(a, HUNDRED);
        (,,,,,, uint8 stB) = split.getInvoice(b);
        assertEq(stB, uint8(ArcSplit.Status.Open));
        _approveAndPay(b, HUNDRED);
        assertEq(usdc.balanceOf(alice), 140 * ONE);
        assertEq(usdc.balanceOf(bob), 60 * ONE);
    }

    function _assertUnpaidAndUntouched(uint256 id, uint256 payerBal) internal view {
        assertEq(usdc.balanceOf(payer), payerBal);
        assertEq(usdc.balanceOf(alice), 0);
        assertEq(usdc.balanceOf(bob), 0);
        (,,,,,, uint8 st) = split.getInvoice(id);
        assertEq(st, uint8(ArcSplit.Status.Open));
    }

    // ───────────────────────── cancel ─────────────────────────

    function test_cancel_emitsAndSetsStatus() public {
        uint256 id = _create();
        vm.expectEmit(true, true, false, true, address(split));
        emit InvoiceCancelled(id, payer);
        vm.prank(payer);
        split.cancelInvoice(id);
        (,,,,,, uint8 st) = split.getInvoice(id);
        assertEq(st, uint8(ArcSplit.Status.Cancelled));
    }

    function test_cancel_revertsUnauthorized() public {
        uint256 id = _create();
        vm.prank(mallory);
        vm.expectRevert(ArcSplit.NotPayer.selector);
        split.cancelInvoice(id);
    }

    function test_cancel_revertsAfterPayment() public {
        uint256 id = _create();
        _approveAndPay(id, HUNDRED);
        vm.prank(payer);
        vm.expectRevert(ArcSplit.InvoiceNotOpen.selector);
        split.cancelInvoice(id);
    }

    function test_cancel_revertsTwice() public {
        uint256 id = _create();
        vm.startPrank(payer);
        split.cancelInvoice(id);
        vm.expectRevert(ArcSplit.InvoiceNotOpen.selector);
        split.cancelInvoice(id);
        vm.stopPrank();
    }

    function test_cancel_revertsUnknownId() public {
        vm.prank(payer);
        vm.expectRevert(ArcSplit.InvoiceNotOpen.selector);
        split.cancelInvoice(7);
    }

    function test_cancel_allowedAfterExpiry() public {
        uint256 id = _create();
        vm.warp(expiry + 1);
        vm.prank(payer);
        split.cancelInvoice(id);
        (,,,,,, uint8 st) = split.getInvoice(id);
        assertEq(st, uint8(ArcSplit.Status.Cancelled));
    }

    // ───────────────────────── fuzz ─────────────────────────

    function testFuzz_previewPayoutsSumsExactly(uint128 amount, uint16 shareBps) public view {
        shareBps = uint16(bound(shareBps, 1, 9_999));
        (uint256 a, uint256 b) = split.previewPayouts(amount, shareBps);
        assertEq(a + b, amount);
        assertEq(a, (uint256(amount) * shareBps) / 10_000);
        assertLe(a * 10_000, uint256(amount) * shareBps);
    }

    function testFuzz_payDistributesExactTotal(uint64 amount, uint16 shareBps) public {
        shareBps = uint16(bound(shareBps, 1, 9_999));
        amount = uint64(bound(amount, 2, 1_000_000_000 * ONE));
        (uint256 pa, uint256 pb) = split.previewPayouts(amount, shareBps);
        vm.assume(pa > 0 && pb > 0);

        usdc.mint(payer, amount);
        uint256 before = usdc.balanceOf(payer);
        vm.prank(payer);
        uint256 id = split.createInvoice(alice, bob, amount, shareBps, expiry);
        _approveAndPay(id, amount);

        assertEq(usdc.balanceOf(alice), pa);
        assertEq(usdc.balanceOf(bob), pb);
        assertEq(before - usdc.balanceOf(payer), amount);
        assertEq(usdc.balanceOf(address(split)), 0);
    }
}

/// Failure-mode tokens: atomic rollback and reentrancy.
contract ArcSplitHostileTokenTest is Test {
    address internal payer = makeAddr("payer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    uint256 internal constant HUNDRED = 100e6;

    function test_falseReturningTokenReverts() public {
        FalseReturnToken t = new FalseReturnToken();
        ArcSplit s = new ArcSplit(address(t));
        vm.startPrank(payer);
        uint256 id = s.createInvoice(alice, bob, HUNDRED, 7_000, uint64(block.timestamp + 1));
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(t)));
        s.payInvoice(id);
        vm.stopPrank();
        (,,,,,, uint8 st) = s.getInvoice(id);
        assertEq(st, uint8(ArcSplit.Status.Open));
    }

    /// Second leg fails (blacklisted B) → first leg to A must be rolled back.
    function test_secondTransferFailureRollsBackFirst() public {
        BlockingToken t = new BlockingToken();
        ArcSplit s = new ArcSplit(address(t));
        t.mint(payer, HUNDRED);
        t.setBlocked(bob);
        vm.startPrank(payer);
        uint256 id = s.createInvoice(alice, bob, HUNDRED, 7_000, uint64(block.timestamp + 1));
        t.approve(address(s), HUNDRED);
        vm.expectRevert("blocked");
        s.payInvoice(id);
        vm.stopPrank();
        assertEq(t.balanceOf(alice), 0);
        assertEq(t.balanceOf(payer), HUNDRED);
        (,,,,,, uint8 st) = s.getInvoice(id);
        assertEq(st, uint8(ArcSplit.Status.Open));
    }

    function _reentrancySetup(bool cancel, bool sameInvoice) internal returns (ReentrantToken t, ArcSplit s, uint256 id) {
        t = new ReentrantToken();
        s = new ArcSplit(address(t));
        t.mint(payer, 2 * HUNDRED);
        vm.startPrank(payer);
        id = s.createInvoice(alice, bob, HUNDRED, 7_000, uint64(block.timestamp + 1));
        uint256 other = s.createInvoice(alice, bob, HUNDRED, 7_000, uint64(block.timestamp + 1));
        t.approve(address(s), 2 * HUNDRED);
        vm.stopPrank();
        t.arm(address(s), sameInvoice ? id : other, cancel);
    }

    /// Token re-enters payInvoice on the same id: blocked by ReentrancyGuard; outer payment completes once.
    function test_reentrantPaySameInvoiceBlocked() public {
        (ReentrantToken t, ArcSplit s, uint256 id) = _reentrancySetup(false, true);
        vm.prank(payer);
        s.payInvoice(id);
        assertEq(bytes4(t.lastRevert()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(t.balanceOf(alice), 70e6);
        assertEq(t.balanceOf(bob), 30e6);
        assertEq(t.balanceOf(payer), HUNDRED);
    }

    /// Token re-enters payInvoice on a different id: also blocked (guard is contract-wide).
    function test_reentrantPayOtherInvoiceBlocked() public {
        (ReentrantToken t, ArcSplit s, uint256 id) = _reentrancySetup(false, false);
        vm.prank(payer);
        s.payInvoice(id);
        assertEq(bytes4(t.lastRevert()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        (,,,,,, uint8 st2) = s.getInvoice(id + 1);
        assertEq(st2, uint8(ArcSplit.Status.Open));
    }

    /// Token re-enters cancelInvoice mid-payment: status is already Paid (CEI), so cancel fails.
    function test_reentrantCancelDuringPayFails() public {
        (ReentrantToken t, ArcSplit s, uint256 id) = _reentrancySetup(true, true);
        vm.prank(payer);
        s.payInvoice(id);
        assertEq(bytes4(t.lastRevert()), ArcSplit.InvoiceNotOpen.selector);
        (,,,,,, uint8 st) = s.getInvoice(id);
        assertEq(st, uint8(ArcSplit.Status.Paid));
    }
}
