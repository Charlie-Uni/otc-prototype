// test/FundToken.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {FundToken} from "src/FundToken.sol";

contract FundTokenTest is Test {
    FundToken token;
    address admin = address(this);          // <-- test contract is admin
    address alice = address(0xBEEF);

    function setUp() public {
        token = new FundToken(admin, "OTC Fund", "OTCF");   // pass admin = this
        token.setWhitelisted(alice, true);                  // no prank needed
        token.grantRole(token.SUBSCRIPTION_ROLE(), admin);
        token.grantRole(token.REDEMPTION_ROLE(), admin);
    }

    function testMintBurn() public {
        token.mint(alice, 1e18);
        assertEq(token.balanceOf(alice), 1e18);
        token.burnFrom(alice, 5e17);
        assertEq(token.balanceOf(alice), 5e17);
    }

    function testPauseBlocksTransfer() public {
        token.mint(admin, 1e18);
        token.setWhitelisted(address(0xCAFE), true);
        token.pause();
        vm.expectRevert();
        token.transfer(address(0xCAFE), 1);
    }
}
