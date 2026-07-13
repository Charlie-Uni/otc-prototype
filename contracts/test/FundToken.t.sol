// test/FundToken.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {FundToken} from "src/FundToken.sol";
import {RiskRegistry} from "src/RiskRegistry.sol";

contract FundTokenTest is Test {
    FundToken token;
    RiskRegistry risk;
    address admin = address(this);          // <-- test contract is admin
    address alice = address(0xBEEF);
    bytes32 fundId = keccak256("OTC_FUND_1");
    bytes32 payloadHash = keccak256("payload");
    bytes32 vcHash = keccak256("alice eligibility");
    event InvestorWhitelisted(address indexed investor, bool eligible, bytes32 indexed vcHash, address indexed by);
    event ShareBalanceUpdated(address indexed investor, uint256 balance, uint256 totalSupply, bytes32 indexed reason);

    function setUp() public {
        risk = new RiskRegistry(admin, _validWeights(), uint64(30 days), 7_000);
        token = new FundToken(admin, "OTC Fund", "OTCF");   // pass admin = this
        token.setWhitelisted(alice, true, vcHash);          // no prank needed
        token.setWhitelisted(admin, true, keccak256("admin eligibility"));
        token.setRiskGate(address(risk), fundId);
        token.grantRole(token.SUBSCRIPTION_ROLE(), admin);
        token.grantRole(token.REDEMPTION_ROLE(), admin);
    }

    function testSetWhitelistedEmitsInvestorEligibilityEvent() public {
        address bob = address(0xCAFE);
        bytes32 bobVcHash = keccak256("bob eligibility");

        vm.expectEmit(true, true, true, true, address(token));
        emit InvestorWhitelisted(bob, true, bobVcHash, admin);
        token.setWhitelisted(bob, true, bobVcHash);

        assertTrue(token.whitelist(bob));
    }

    function testMintRejectsUnwhitelistedInvestor() public {
        address bob = address(0xCAFE);

        vm.expectRevert(bytes("NOT_WHITELISTED"));
        token.mint(bob, 1e18);
    }

    function testMintBurn() public {
        vm.expectEmit(true, true, false, true, address(token));
        emit ShareBalanceUpdated(alice, 1e18, 1e18, keccak256("SHARE_MINTED"));
        token.mint(alice, 1e18);
        assertEq(token.balanceOf(alice), 1e18);

        vm.expectEmit(true, true, false, true, address(token));
        emit ShareBalanceUpdated(alice, 5e17, 5e17, keccak256("SHARE_BURNED"));
        token.burnFrom(alice, 5e17);
        assertEq(token.balanceOf(alice), 5e17);
    }

    function testBurnWithoutRiskGateStillWorks() public {
        FundToken ungatedToken = new FundToken(admin, "OTC Fund", "OTCF");
        ungatedToken.setWhitelisted(alice, true, vcHash);
        ungatedToken.grantRole(ungatedToken.SUBSCRIPTION_ROLE(), admin);
        ungatedToken.grantRole(ungatedToken.REDEMPTION_ROLE(), admin);

        ungatedToken.mint(alice, 1e18);
        ungatedToken.burnFrom(alice, 5e17);

        assertEq(ungatedToken.balanceOf(alice), 5e17);
    }

    function testPauseBlocksTransfer() public {
        token.mint(admin, 1e18);
        token.setWhitelisted(address(0xCAFE), true, keccak256("receiver eligibility"));
        token.pause();
        vm.expectRevert();
        token.transfer(address(0xCAFE), 1);
    }

    function testTransferEmitsShareBalanceUpdatedForBothHolders() public {
        address bob = address(0xCAFE);
        token.setWhitelisted(bob, true, keccak256("bob eligibility"));
        token.mint(alice, 1e18);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(token));
        emit ShareBalanceUpdated(alice, 1e18 - 10, 1e18, keccak256("SHARE_TRANSFERRED"));
        vm.expectEmit(true, true, false, true, address(token));
        emit ShareBalanceUpdated(bob, 10, 1e18, keccak256("SHARE_TRANSFERRED"));
        token.transfer(bob, 10);
    }

    function testGateBlocksAndReleaseRestoresRedemption() public {
        token.mint(alice, 1e18);

        risk.submitMetrics(fundId, _highRiskMetrics(), 1, uint64(block.timestamp), payloadHash);
        assertTrue(risk.isGated(fundId));

        vm.expectRevert(bytes("REDEMPTION_GATED"));
        token.burnFrom(alice, 5e17);

        risk.releaseGate(fundId, keccak256("risk normalized"));
        token.burnFrom(alice, 5e17);

        assertEq(token.balanceOf(alice), 5e17);
    }

    function _validWeights() private pure returns (uint16[6] memory weights) {
        weights = [uint16(2_000), 2_000, 2_000, 2_000, 1_000, 1_000];
    }

    function _highRiskMetrics() private pure returns (RiskRegistry.RiskMetrics memory) {
        return RiskRegistry.RiskMetrics({
            valuationHaircutBps: 8_000,
            redemptionPressureBps: 8_500,
            redemptionQueueRatioBps: 7_900,
            liquidityShortfallBps: 8_800,
            stalePricingRiskBps: 7_500,
            investorConcentrationBps: 7_800
        });
    }

}
