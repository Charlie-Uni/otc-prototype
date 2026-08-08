// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {RiskRegistry} from "production/RiskRegistry.sol";
import {ExperimentalFundToken} from "../generated/ExperimentalFundToken.sol";
import {ExperimentalNAVRegistry} from "../generated/ExperimentalNAVRegistry.sol";

contract PreregistrationInfrastructureTest is Test {
    bytes32 private constant FUND_ID = 0xac4a93645b61f4f102884f40e6a589263b542e97cda3dd28d1de825f80f90169;
    address private constant ADMIN = 0x000000000000000000000000000000000000a001;
    address private constant ALICE = 0x000000000000000000000000000000000000a101;

    RiskRegistry private risk;
    ExperimentalNAVRegistry private nav;
    ExperimentalFundToken private token;

    function setUp() public {
        vm.warp(1_710_000_000);
        uint16[6] memory weights = [uint16(1667), 1667, 1667, 1667, 1666, 1666];
        risk = new RiskRegistry(ADMIN, weights, 30 days, 7_000);
        nav = new ExperimentalNAVRegistry(ADMIN, true, true, true);
        token = new ExperimentalFundToken(
            ADMIN, "Experimental OTC Fund", "xOTC", FUND_ID, address(nav), true, true, true, true, true
        );

        vm.startPrank(ADMIN);
        nav.postInitialNAV(FUND_ID, 1e18, uint64(block.timestamp), keccak256("initial nav"));
        token.setWhitelisted(ALICE, true, keccak256("alice eligibility"));
        token.grantRole(token.SUBSCRIPTION_ROLE(), ADMIN);
        token.grantRole(token.REDEMPTION_ROLE(), ADMIN);
        vm.stopPrank();

        vm.prank(ALICE);
        token.requestSubscription(100e18);
        vm.prank(ADMIN);
        token.acceptSubscription(0);
    }

    function testRedemptionFailsClosedWithoutConfiguredRiskGate() public {
        vm.expectRevert(bytes("RISK_GATE_NOT_CONFIGURED"));
        vm.prank(ALICE);
        token.requestRedemption(20e18);
    }

    function testConfiguredProductionRiskRegistryIsNonGatedWithoutMetrics() public {
        vm.prank(ADMIN);
        token.setRiskGate(address(risk));

        assertFalse(risk.isGated(FUND_ID));
        vm.prank(ALICE);
        uint256 requestId = token.requestRedemption(20e18);
        assertEq(requestId, 0);
        assertEq(token.totalQueuedRedemption(), 20e18);
    }
}
