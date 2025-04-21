// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface IMesonMinimal {
    function tokenForIndex(uint8 tokenIndex) external returns (address token);
    function postSwapFromContract(uint256 encodedSwap, uint200 postingValue, address fromContract)
        payable external;
}

contract TransferToMesonContract {
    IMesonMinimal meson;

    constructor(address mesonAddress) {
        meson = IMesonMinimal(mesonAddress);
    }

    function transferToMeson(uint256 encodedSwap, address initiator) payable external {
        address tokenAddr = _tokenAddrFrom(encodedSwap);
        require(tokenAddr != address(0), "Unsupported token");

        uint200 postingValue = (uint200(uint160(initiator)) << 40) + 1;
        if (tokenAddr == address(0x1)) {
            // Core tokens (the token used to pay gas fees)
            uint256 amount = _amountFrom(encodedSwap, 18);
            require(amount == msg.value, "Tx value does not match the amount");
            meson.postSwapFromContract{value: amount}(encodedSwap, postingValue, address(this));
        } else {
            // ERC20 tokens
            ERC20 tokenContract = ERC20(tokenAddr);

            uint8 tokenDecimals = tokenContract.decimals();
            uint256 amount = _amountFrom(encodedSwap, tokenDecimals);

            // Option to transfer tokens directly from user's address
            tokenContract.transferFrom(msg.sender, address(this), amount);
            tokenContract.approve(address(meson), amount);

            meson.postSwapFromContract(encodedSwap, postingValue, address(this));
        }
    }

    function _amountFrom(uint256 encodedSwap, uint8 tokenDecimals) internal pure returns (uint256 amount) {
        uint256 amountInMeson = (encodedSwap >> 208) & 0xFFFFFFFFFF;

        if (tokenDecimals == 6) {
            amount = amountInMeson;
        } else if (tokenDecimals >= 6) {
            // NOTE: Meson's smart contract always use decimal 6 to hanle swap amount.
            // Some tokens like ETH, BTC or stablecoins on BNB Chain & Conflux
            // have other decimals, so a conversion is required.
            amount = amountInMeson * 10 ** (tokenDecimals - 6);
        } else {
            require(amountInMeson % (10 ** (6 - tokenDecimals)) == 0, "Decimals overflow");
            amount = amountInMeson / 10 ** (6 - tokenDecimals);
        }
    }

    function _tokenAddrFrom(uint256 encodedSwap) internal returns (address) {
        uint8 tokenIndex = uint8(encodedSwap);
        return meson.tokenForIndex(tokenIndex);
    }
}