// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {NAVRegistry} from "src/NAVRegistry.sol";

contract NAVRegistryTest is Test {
    NAVRegistry nav;
    address admin = address(0xA11CE);

    function setUp() public {
        vm.prank(admin);
        nav = new NAVRegistry(admin);
    }

    function testPostAndRead() public {
        vm.prank(admin); nav.postNAV(123_456_789, 1710000000);
        NAVRegistry.NavRecord memory rec = nav.latestNAV();
        assertEq(rec.nav, 123_456_789);
        assertEq(rec.asOf, 1710000000);
        assertGt(rec.storedAt, 0);
    }
}
