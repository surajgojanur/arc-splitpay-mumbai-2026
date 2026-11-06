// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IArcSplitPay {
    function payInvoice(uint256 id) external;
    function cancelInvoice(uint256 id) external;
}

/// @dev Local stand-in for USDC: 6 decimals, open mint. Unit tests only — never deployed to Arc.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}

    function decimals() public pure virtual override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract Mock18 is ERC20 {
    constructor() ERC20("Eighteen", "E18") {}
}

/// @dev transferFrom returns false instead of reverting.
contract FalseReturnToken is MockUSDC {
    function transferFrom(address, address, uint256) public pure override returns (bool) {
        return false;
    }
}

/// @dev Reverts any transfer whose destination is `blocked` (models a blacklisted recipient).
contract BlockingToken is MockUSDC {
    address public blocked;

    function setBlocked(address a) external {
        blocked = a;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(to != blocked, "blocked");
        super._update(from, to, value);
    }
}

/// @dev On transferFrom, re-enters ArcSplit with the configured call before moving funds.
contract ReentrantToken is MockUSDC {
    address public target;
    uint256 public reenterId;
    bool public useCancel;
    bool public armed;
    bytes public lastRevert;

    function arm(address target_, uint256 id, bool cancel) external {
        target = target_;
        reenterId = id;
        useCancel = cancel;
        armed = true;
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        if (armed) {
            armed = false;
            bytes memory data = useCancel
                ? abi.encodeCall(IArcSplitPay.cancelInvoice, (reenterId))
                : abi.encodeCall(IArcSplitPay.payInvoice, (reenterId));
            (bool ok, bytes memory ret) = target.call(data);
            if (ok) revert("reentrancy succeeded");
            lastRevert = ret;
        }
        return super.transferFrom(from, to, value);
    }
}
