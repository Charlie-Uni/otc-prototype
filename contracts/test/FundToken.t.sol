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
    event RedemptionRequested(
        bytes32 indexed fundId,
        address indexed investor,
        uint256 indexed requestId,
        uint256 amount,
        uint64 requestedAt
    );
    event RedemptionQueueUpdated(
        bytes32 indexed fundId,
        uint256 totalQueuedRedemption,
        uint256 totalSupply,
        uint16 redemptionQueueRatioBps,
        uint64 updatedAt
    );
    event RedemptionSettled(
        bytes32 indexed fundId,
        address indexed investor,
        uint256 indexed requestId,
        uint256 amount,
        uint64 requestedAt,
        uint64 settledAt
    );
    event SettlementDelayed(
        bytes32 indexed fundId,
        address indexed investor,
        uint256 indexed requestId,
        uint256 amount,
        uint64 requestedAt,
        uint64 observedAt,
        bytes32 reasonHash
    );

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

    function testMintAndSettleThroughRedemptionQueue() public {
        vm.expectEmit(true, true, false, true, address(token));
        emit ShareBalanceUpdated(alice, 1e18, 1e18, keccak256("SHARE_MINTED"));
        token.mint(alice, 1e18);
        assertEq(token.balanceOf(alice), 1e18);

        uint256 requestId = token.requestRedemptionFor(alice, 5e17);

        vm.expectEmit(true, true, false, true, address(token));
        emit ShareBalanceUpdated(alice, 5e17, 5e17, keccak256("SHARE_BURNED"));
        token.settleRedemption(requestId);
        assertEq(token.balanceOf(alice), 5e17);
    }

    function testRequestRedemptionEmitsLifecycleEventsAndUpdatesQueueRatio() public {
        token.mint(alice, 1e18);
        vm.warp(1_710_000_000);

        vm.expectEmit(true, true, true, true, address(token));
        emit RedemptionRequested(fundId, alice, 0, 2e17, uint64(block.timestamp));
        vm.expectEmit(true, false, false, true, address(token));
        emit RedemptionQueueUpdated(fundId, 2e17, 1e18, 2_000, uint64(block.timestamp));

        uint256 requestId = token.requestRedemptionFor(alice, 2e17);

        assertEq(requestId, 0);
        assertEq(token.queuedRedemptionOf(alice), 2e17);
        assertEq(token.totalQueuedRedemption(), 2e17);
        assertEq(token.redemptionQueueRatioBps(), 2_000);
    }

    function testInvestorCanRequestOwnRedemption() public {
        token.mint(alice, 1e18);

        vm.prank(alice);
        uint256 requestId = token.requestRedemption(1e17);

        assertEq(requestId, 0);
        assertEq(token.queuedRedemptionOf(alice), 1e17);
    }

    function testRequestRedemptionRejectsUnavailableShares() public {
        token.mint(alice, 1e18);
        token.requestRedemptionFor(alice, 8e17);

        vm.expectRevert(bytes("INSUFFICIENT_AVAILABLE_SHARES"));
        token.requestRedemptionFor(alice, 3e17);
    }

    function testQueuedSharesCannotBeTransferred() public {
        address bob = address(0xCAFE);
        token.setWhitelisted(bob, true, keccak256("bob eligibility"));
        token.mint(alice, 1e18);
        token.requestRedemptionFor(alice, 8e17);

        vm.prank(alice);
        vm.expectRevert(bytes("INSUFFICIENT_AVAILABLE_SHARES"));
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        token.transfer(bob, 3e17);
    }

    function testSettleRedemptionBurnsSharesAndReducesQueue() public {
        token.mint(alice, 1e18);
        vm.warp(1_710_000_000);
        uint256 requestId = token.requestRedemptionFor(alice, 2e17);
        uint64 requestedAt = uint64(block.timestamp);

        vm.warp(1_710_000_600);
        vm.expectEmit(true, true, true, true, address(token));
        emit ShareBalanceUpdated(alice, 8e17, 8e17, keccak256("SHARE_BURNED"));
        vm.expectEmit(true, true, true, true, address(token));
        emit RedemptionSettled(fundId, alice, requestId, 2e17, requestedAt, uint64(block.timestamp));
        vm.expectEmit(true, false, false, true, address(token));
        emit RedemptionQueueUpdated(fundId, 0, 8e17, 0, uint64(block.timestamp));

        token.settleRedemption(requestId);

        assertEq(token.balanceOf(alice), 8e17);
        assertEq(token.queuedRedemptionOf(alice), 0);
        assertEq(token.totalQueuedRedemption(), 0);
        assertEq(token.redemptionQueueRatioBps(), 0);
    }

    function testSettlementDelayCanBeFlaggedForPendingRequest() public {
        token.mint(alice, 1e18);
        vm.warp(1_710_000_000);
        uint256 requestId = token.requestRedemptionFor(alice, 2e17);
        bytes32 reasonHash = keccak256("custodian settlement pending");

        vm.warp(1_710_086_400);
        vm.expectEmit(true, true, true, true, address(token));
        emit SettlementDelayed(fundId, alice, requestId, 2e17, 1_710_000_000, uint64(block.timestamp), reasonHash);
        token.flagSettlementDelayed(requestId, reasonHash);
    }

    function testSettlementWithoutRiskGateStillWorks() public {
        FundToken ungatedToken = new FundToken(admin, "OTC Fund", "OTCF");
        ungatedToken.setWhitelisted(alice, true, vcHash);
        ungatedToken.grantRole(ungatedToken.SUBSCRIPTION_ROLE(), admin);
        ungatedToken.grantRole(ungatedToken.REDEMPTION_ROLE(), admin);

        ungatedToken.mint(alice, 1e18);
        uint256 requestId = ungatedToken.requestRedemptionFor(alice, 5e17);
        ungatedToken.settleRedemption(requestId);

        assertEq(ungatedToken.balanceOf(alice), 5e17);
    }

    function testPauseBlocksTransfer() public {
        token.mint(admin, 1e18);
        token.setWhitelisted(address(0xCAFE), true, keccak256("receiver eligibility"));
        token.pause();
        vm.expectRevert();
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
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
        assertTrue(token.transfer(bob, 10));
    }

    function testGateBlocksAndReleaseRestoresRedemption() public {
        token.mint(alice, 1e18);

        risk.submitMetrics(fundId, _highRiskMetrics(), 1, uint64(block.timestamp), payloadHash);
        assertTrue(risk.isGated(fundId));

        vm.expectRevert(bytes("REDEMPTION_GATED"));
        token.requestRedemptionFor(alice, 5e17);

        risk.releaseGate(fundId, keccak256("risk normalized"));
        uint256 requestId = token.requestRedemptionFor(alice, 5e17);
        token.settleRedemption(requestId);

        assertEq(token.balanceOf(alice), 5e17);
    }

    function testGateBlocksSettlementOfExistingQueueAndReleaseRestoresSettlement() public {
        token.mint(alice, 1e18);
        uint256 requestId = token.requestRedemptionFor(alice, 5e17);

        risk.submitMetrics(fundId, _highRiskMetrics(), 1, uint64(block.timestamp), payloadHash);
        assertTrue(risk.isGated(fundId));

        vm.expectRevert(bytes("REDEMPTION_GATED"));
        token.settleRedemption(requestId);

        risk.releaseGate(fundId, keccak256("risk normalized"));
        token.settleRedemption(requestId);

        assertEq(token.balanceOf(alice), 5e17);
        assertEq(token.totalQueuedRedemption(), 0);
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
