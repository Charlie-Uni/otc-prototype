// test/FundToken.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {Math} from "openzeppelin/utils/math/Math.sol";
import {FundToken, INAVRegistry} from "src/FundToken.sol";
import {NAVRegistry} from "src/NAVRegistry.sol";
import {RiskRegistry} from "src/RiskRegistry.sol";

contract FundTokenTest is Test {
    using stdStorage for StdStorage;

    FundToken token;
    NAVRegistry nav;
    RiskRegistry risk;
    address admin = address(this); // <-- test contract is admin
    address alice = address(0xBEEF);
    bytes32 fundId = keccak256("OTC_FUND_1");
    bytes32 payloadHash = keccak256("payload");
    bytes32 vcHash = keccak256("alice eligibility");
    event InvestorWhitelisted(address indexed investor, bool eligible, bytes32 indexed vcHash, address indexed by);
    event ShareBalanceUpdated(address indexed investor, uint256 balance, uint256 totalSupply, bytes32 indexed reason);
    event SubscriptionRequested(
        bytes32 indexed fundId,
        address indexed investor,
        uint256 indexed requestId,
        uint256 subscriptionAmount,
        uint64 requestedAt,
        bytes32 requestHash
    );
    event SubscriptionAccepted(
        bytes32 indexed fundId,
        address indexed investor,
        uint256 indexed requestId,
        uint256 subscriptionAmount,
        uint256 mintedShares,
        uint256 navUsed,
        uint64 navAsOf,
        uint64 requestedAt,
        uint64 acceptedAt,
        bytes32 requestHash
    );
    event RedemptionRequested(
        bytes32 indexed fundId,
        address indexed investor,
        uint256 indexed requestId,
        uint256 redeemedShares,
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
        uint256 redeemedShares,
        uint256 redemptionAmount,
        uint256 settlementNav,
        uint64 settlementNavAsOf,
        uint64 requestedAt,
        uint64 settledAt
    );
    event SettlementDelayed(
        bytes32 indexed fundId,
        address indexed investor,
        uint256 indexed requestId,
        uint256 redeemedShares,
        uint64 requestedAt,
        uint64 delayedAt,
        bytes32 reasonHash
    );

    function setUp() public {
        risk = new RiskRegistry(admin, _validWeights(), uint64(30 days), 7_000);
        nav = new NAVRegistry(admin);
        nav.postInitialNAV(fundId, 1e18, uint64(block.timestamp), keccak256("initial nav"));
        token = new FundToken(admin, "OTC Fund", "OTCF", fundId, address(nav));
        token.setWhitelisted(alice, true, vcHash); // no prank needed
        token.setWhitelisted(admin, true, keccak256("admin eligibility"));
        token.setRiskGate(address(risk));
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

    function testWhitelistingRequiresInvestorAndEligibilityCommitment() public {
        vm.expectRevert(bytes("INVALID_INVESTOR"));
        token.setWhitelisted(address(0), true, vcHash);

        vm.expectRevert(bytes("INVALID_VC_HASH"));
        token.setWhitelisted(address(0xCAFE), true, bytes32(0));
    }

    function testFundIdentityCannotBeZeroAtDeployment() public {
        vm.expectRevert(bytes("INVALID_FUND_ID"));
        new FundToken(admin, "Invalid Fund", "INVALID", bytes32(0), address(nav));
    }

    function testNAVRegistryCannotBeZeroAtDeployment() public {
        vm.expectRevert(bytes("INVALID_NAV_REGISTRY"));
        new FundToken(admin, "Invalid Fund", "INVALID", fundId, address(0));
    }

    function testAdminCannotBeZeroAtDeployment() public {
        vm.expectRevert(bytes("INVALID_ADMIN"));
        new FundToken(address(0), "Invalid Fund", "INVALID", fundId, address(nav));
    }

    function testSubscriptionRequestRejectsUnwhitelistedInvestor() public {
        address bob = address(0xCAFE);

        vm.expectRevert(bytes("NOT_WHITELISTED"));
        token.requestSubscriptionFor(bob, 1e18);
    }

    function testInvestorCanRequestOwnSubscription() public {
        vm.prank(alice);
        uint256 requestId = token.requestSubscription(1e18);

        assertEq(requestId, 0);
        assertEq(token.subscriptionRequestAt(requestId).investor, alice);
        assertFalse(token.subscriptionRequestAt(requestId).accepted);
    }

    function testSubscriptionRejectsZeroAmount() public {
        vm.expectRevert(bytes("INVALID_SUBSCRIPTION_AMOUNT"));
        token.requestSubscriptionFor(alice, 0);
    }

    function testSubscriptionRequestAndAcceptanceFormAuditableStateMachine() public {
        vm.warp(1_710_000_000);
        bytes32 requestHash = keccak256(
            abi.encode(block.chainid, address(token), fundId, uint256(0), alice, uint256(1e18), uint64(block.timestamp))
        );

        vm.expectEmit(true, true, true, true, address(token));
        emit SubscriptionRequested(fundId, alice, 0, 1e18, uint64(block.timestamp), requestHash);
        uint256 subscriptionId = token.requestSubscriptionFor(alice, 1e18);

        FundToken.SubscriptionRequest memory pending = token.subscriptionRequestAt(subscriptionId);
        assertEq(pending.investor, alice);
        assertEq(pending.subscriptionAmount, 1e18);
        assertEq(pending.mintedShares, 0);
        assertEq(pending.navUsed, 0);
        assertEq(pending.navAsOf, 0);
        assertEq(pending.requestedAt, block.timestamp);
        assertEq(pending.acceptedAt, 0);
        assertEq(pending.requestHash, requestHash);
        assertFalse(pending.accepted);
        assertEq(token.balanceOf(alice), 0);

        vm.warp(1_710_000_060);
        vm.expectEmit(true, true, true, true, address(token));
        emit SubscriptionAccepted(
            fundId, alice, subscriptionId, 1e18, 1e18, 1e18, 1, 1_710_000_000, 1_710_000_060, requestHash
        );
        vm.expectEmit(true, true, false, true, address(token));
        emit ShareBalanceUpdated(alice, 1e18, 1e18, keccak256("SHARE_MINTED"));
        token.acceptSubscription(subscriptionId);

        FundToken.SubscriptionRequest memory accepted = token.subscriptionRequestAt(subscriptionId);
        assertEq(accepted.acceptedAt, 1_710_000_060);
        assertEq(accepted.mintedShares, 1e18);
        assertEq(accepted.navUsed, 1e18);
        assertEq(accepted.navAsOf, 1);
        assertTrue(accepted.accepted);
        assertEq(token.balanceOf(alice), 1e18);
    }

    function testSubscriptionConvertsCashAmountToSharesUsingLatestNAV() public {
        NAVRegistry conversionNav = new NAVRegistry(admin);
        conversionNav.postInitialNAV(fundId, 2e18, uint64(block.timestamp), keccak256("two nav"));
        FundToken conversionToken = new FundToken(admin, "OTC Fund", "OTCF", fundId, address(conversionNav));
        conversionToken.setWhitelisted(alice, true, vcHash);
        conversionToken.grantRole(conversionToken.SUBSCRIPTION_ROLE(), admin);

        uint256 requestId = conversionToken.requestSubscriptionFor(alice, 100e18);
        conversionToken.acceptSubscription(requestId);

        FundToken.SubscriptionRequest memory request = conversionToken.subscriptionRequestAt(requestId);
        assertEq(request.subscriptionAmount, 100e18);
        assertEq(request.mintedShares, 50e18);
        assertEq(request.navUsed, 2e18);
        assertEq(conversionToken.balanceOf(alice), 50e18);
    }

    function testSubscriptionRejectsAmountThatRoundsToZeroShares() public {
        NAVRegistry conversionNav = new NAVRegistry(admin);
        conversionNav.postInitialNAV(fundId, 2e18, uint64(block.timestamp), keccak256("two nav"));
        FundToken conversionToken = new FundToken(admin, "OTC Fund", "OTCF", fundId, address(conversionNav));
        conversionToken.setWhitelisted(alice, true, vcHash);
        conversionToken.grantRole(conversionToken.SUBSCRIPTION_ROLE(), admin);
        uint256 requestId = conversionToken.requestSubscriptionFor(alice, 1);

        vm.expectRevert(bytes("SUBSCRIPTION_TOO_SMALL"));
        conversionToken.acceptSubscription(requestId);
    }

    function testFuzz_SubscriptionUsesFixedPointNAVFormula(uint128 rawAmount, uint128 rawNav) public {
        uint256 subscriptionAmount = bound(uint256(rawAmount), 1e12, 1e30);
        uint256 navUsed = bound(uint256(rawNav), 1e12, 1e24);
        vm.mockCall(
            address(nav),
            abi.encodeWithSelector(INAVRegistry.latestNAV.selector, fundId),
            abi.encode(navUsed, 0, 0, uint64(1), uint64(1), int256(0), payloadHash, true)
        );

        uint256 requestId = token.requestSubscriptionFor(alice, subscriptionAmount);
        token.acceptSubscription(requestId);

        uint256 expectedShares = Math.mulDiv(subscriptionAmount, token.NAV_SCALE(), navUsed);
        assertEq(token.balanceOf(alice), expectedShares);
        assertEq(token.subscriptionRequestAt(requestId).mintedShares, expectedShares);
    }

    function testSubscriptionCannotBeAcceptedTwice() public {
        uint256 requestId = token.requestSubscriptionFor(alice, 1e18);
        token.acceptSubscription(requestId);

        vm.expectRevert(bytes("SUBSCRIPTION_ALREADY_ACCEPTED"));
        token.acceptSubscription(requestId);
    }

    function testOnlySubscriptionRoleCanAcceptRequest() public {
        uint256 requestId = token.requestSubscriptionFor(alice, 1e18);

        vm.prank(alice);
        vm.expectRevert();
        token.acceptSubscription(requestId);
    }

    function testSubscriptionAcceptanceRechecksEligibility() public {
        uint256 requestId = token.requestSubscriptionFor(alice, 1e18);
        token.setWhitelisted(alice, false, bytes32(0));

        vm.expectRevert(bytes("NOT_WHITELISTED"));
        token.acceptSubscription(requestId);
    }

    function testAcceptedSubscriptionCanSettleThroughRedemptionQueue() public {
        _subscribe(token, alice, 1e18);

        uint256 requestId = token.requestRedemptionFor(alice, 5e17);

        vm.expectEmit(true, true, false, true, address(token));
        emit ShareBalanceUpdated(alice, 5e17, 5e17, keccak256("SHARE_BURNED"));
        token.settleRedemption(requestId);
        assertEq(token.balanceOf(alice), 5e17);
    }

    function testRequestRedemptionEmitsLifecycleEventsAndUpdatesQueueRatio() public {
        _subscribe(token, alice, 1e18);
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
        _subscribe(token, alice, 1e18);

        vm.prank(alice);
        uint256 requestId = token.requestRedemption(1e17);

        assertEq(requestId, 0);
        assertEq(token.queuedRedemptionOf(alice), 1e17);
    }

    function testRequestRedemptionRejectsUnavailableShares() public {
        _subscribe(token, alice, 1e18);
        token.requestRedemptionFor(alice, 8e17);

        vm.expectRevert(bytes("INSUFFICIENT_AVAILABLE_SHARES"));
        token.requestRedemptionFor(alice, 3e17);
    }

    function testQueuedSharesCannotBeTransferred() public {
        address bob = address(0xCAFE);
        token.setWhitelisted(bob, true, keccak256("bob eligibility"));
        _subscribe(token, alice, 1e18);
        token.requestRedemptionFor(alice, 8e17);

        vm.prank(alice);
        vm.expectRevert(bytes("INSUFFICIENT_AVAILABLE_SHARES"));
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        token.transfer(bob, 3e17);
    }

    function testSettleRedemptionBurnsSharesAndReducesQueue() public {
        _subscribe(token, alice, 1e18);
        vm.warp(1_710_000_000);
        uint256 requestId = token.requestRedemptionFor(alice, 2e17);
        uint64 requestedAt = uint64(block.timestamp);

        vm.warp(1_710_000_600);
        vm.expectEmit(true, true, true, true, address(token));
        emit ShareBalanceUpdated(alice, 8e17, 8e17, keccak256("SHARE_BURNED"));
        vm.expectEmit(true, true, true, true, address(token));
        emit RedemptionSettled(fundId, alice, requestId, 2e17, 2e17, 1e18, 1, requestedAt, uint64(block.timestamp));
        vm.expectEmit(true, false, false, true, address(token));
        emit RedemptionQueueUpdated(fundId, 0, 8e17, 0, uint64(block.timestamp));

        token.settleRedemption(requestId);

        assertEq(token.balanceOf(alice), 8e17);
        assertEq(token.queuedRedemptionOf(alice), 0);
        assertEq(token.totalQueuedRedemption(), 0);
        assertEq(token.redemptionQueueRatioBps(), 0);
        FundToken.RedemptionRequest memory request = token.redemptionRequestAt(requestId);
        assertEq(request.redeemedShares, 2e17);
        assertEq(request.redemptionAmount, 2e17);
        assertEq(request.settlementNav, 1e18);
        assertEq(request.settlementNavAsOf, 1);
    }

    function testRedemptionSettlementComputesCashAmountUsingLatestNAV() public {
        _subscribe(token, alice, 1e18);
        nav.postNAV(fundId, 1.1e18, 1e18, uint64(block.timestamp), keccak256("adjusted nav"));
        uint256 requestId = token.requestRedemptionFor(alice, 2e17);

        token.settleRedemption(requestId);

        FundToken.RedemptionRequest memory request = token.redemptionRequestAt(requestId);
        assertEq(request.redeemedShares, 2e17);
        assertEq(request.redemptionAmount, 2.2e17);
        assertEq(request.settlementNav, 1.1e18);
    }

    function testFuzz_RedemptionUsesFixedPointNAVFormula(uint128 rawShares, uint128 rawNav) public {
        uint256 redeemedShares = bound(uint256(rawShares), 1e6, 1e24);
        uint256 settlementNav = bound(uint256(rawNav), 1e12, 1e24);
        _subscribe(token, alice, redeemedShares);
        vm.mockCall(
            address(nav),
            abi.encodeWithSelector(INAVRegistry.latestNAV.selector, fundId),
            abi.encode(settlementNav, 0, 0, uint64(2), uint64(2), int256(0), payloadHash, false)
        );
        uint256 requestId = token.requestRedemptionFor(alice, redeemedShares);

        token.settleRedemption(requestId);

        FundToken.RedemptionRequest memory request = token.redemptionRequestAt(requestId);
        assertEq(request.redemptionAmount, Math.mulDiv(redeemedShares, settlementNav, token.NAV_SCALE()));
        assertEq(request.settlementNav, settlementNav);
        assertEq(token.balanceOf(alice), 0);
    }

    function testRedemptionRejectsSettlementThatRoundsToZeroCash() public {
        _subscribe(token, alice, 1);
        uint256 requestId = token.requestRedemptionFor(alice, 1);
        vm.mockCall(
            address(nav),
            abi.encodeWithSelector(INAVRegistry.latestNAV.selector, fundId),
            abi.encode(uint256(1), 0, 0, uint64(2), uint64(2), int256(0), payloadHash, false)
        );

        vm.expectRevert(bytes("REDEMPTION_TOO_SMALL"));
        token.settleRedemption(requestId);
    }

    function testSettlementDelayCanBeFlaggedForPendingRequest() public {
        _subscribe(token, alice, 1e18);
        vm.warp(1_710_000_000);
        uint256 requestId = token.requestRedemptionFor(alice, 2e17);
        bytes32 reasonHash = keccak256("custodian settlement pending");

        vm.warp(1_710_086_400);
        vm.expectEmit(true, true, true, true, address(token));
        emit SettlementDelayed(fundId, alice, requestId, 2e17, 1_710_000_000, uint64(block.timestamp), reasonHash);
        token.flagSettlementDelayed(requestId, reasonHash);

        FundToken.RedemptionRequest memory request = token.redemptionRequestAt(requestId);
        assertTrue(request.delayed);
        assertEq(request.delayedAt, block.timestamp);
        assertEq(request.delayReasonHash, reasonHash);

        vm.expectRevert(bytes("SETTLEMENT_ALREADY_DELAYED"));
        token.flagSettlementDelayed(requestId, reasonHash);
    }

    function testSettlementDelayRequiresReasonCommitment() public {
        _subscribe(token, alice, 1e18);
        uint256 requestId = token.requestRedemptionFor(alice, 2e17);

        vm.expectRevert(bytes("INVALID_REASON_HASH"));
        token.flagSettlementDelayed(requestId, bytes32(0));
    }

    function testSetRiskGateRejectsZeroAddress() public {
        vm.expectRevert(bytes("INVALID_RISK_GATE"));
        token.setRiskGate(address(0));
    }

    function testRedemptionRequestFailsClosedWithoutRiskGate() public {
        FundToken unconfiguredToken = _newTokenWithoutRiskGate();
        _subscribe(unconfiguredToken, alice, 1e18);

        vm.expectRevert(bytes("RISK_GATE_NOT_CONFIGURED"));
        unconfiguredToken.requestRedemptionFor(alice, 5e17);
    }

    function testRedemptionSettlementFailsClosedWhenRiskGateIsRemovedFromStorage() public {
        _subscribe(token, alice, 1e18);
        uint256 requestId = token.requestRedemptionFor(alice, 5e17);
        stdstore.target(address(token)).sig(token.riskGate.selector).checked_write(address(0));

        vm.expectRevert(bytes("RISK_GATE_NOT_CONFIGURED"));
        token.settleRedemption(requestId);
    }

    function testPauseBlocksTransfer() public {
        _subscribe(token, admin, 1e18);
        token.setWhitelisted(address(0xCAFE), true, keccak256("receiver eligibility"));
        token.pause();
        vm.expectRevert();
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        token.transfer(address(0xCAFE), 1);
    }

    function testTransferEmitsShareBalanceUpdatedForBothHolders() public {
        address bob = address(0xCAFE);
        token.setWhitelisted(bob, true, keccak256("bob eligibility"));
        _subscribe(token, alice, 1e18);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(token));
        emit ShareBalanceUpdated(alice, 1e18 - 10, 1e18, keccak256("SHARE_TRANSFERRED"));
        vm.expectEmit(true, true, false, true, address(token));
        emit ShareBalanceUpdated(bob, 10, 1e18, keccak256("SHARE_TRANSFERRED"));
        assertTrue(token.transfer(bob, 10));
    }

    function testGateBlocksAndReleaseRestoresRedemption() public {
        _subscribe(token, alice, 1e18);

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
        _subscribe(token, alice, 1e18);
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
        weights = [uint16(1_667), 1_667, 1_667, 1_667, 1_666, 1_666];
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

    function _subscribe(FundToken target, address investor, uint256 amount) private {
        uint256 requestId = target.requestSubscriptionFor(investor, amount);
        target.acceptSubscription(requestId);
    }

    function _newTokenWithoutRiskGate() private returns (FundToken unconfiguredToken) {
        unconfiguredToken = new FundToken(admin, "OTC Fund", "OTCF", fundId, address(nav));
        unconfiguredToken.setWhitelisted(alice, true, vcHash);
        unconfiguredToken.grantRole(unconfiguredToken.SUBSCRIPTION_ROLE(), admin);
        unconfiguredToken.grantRole(unconfiguredToken.REDEMPTION_ROLE(), admin);
    }
}
