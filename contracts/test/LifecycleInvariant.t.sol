// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";
import {Math} from "openzeppelin/utils/math/Math.sol";
import {FundToken} from "src/FundToken.sol";
import {NAVRegistry} from "src/NAVRegistry.sol";
import {RiskRegistry} from "src/RiskRegistry.sol";

contract LifecycleHandler is Test {
    uint256 private constant MIN_SUBSCRIPTION_AMOUNT = 1e12;
    uint256 private constant MAX_SUBSCRIPTION_AMOUNT = 100e18;
    uint256 private constant MIN_NAV = 1e18;
    uint256 private constant MAX_NAV = 2e18;

    FundToken public immutable token;
    NAVRegistry public immutable nav;
    RiskRegistry public immutable risk;
    bytes32 public immutable fundId;

    address[4] private actors;
    address private constant OUTSIDER = address(0xDEAD);

    bool public gateTransitionViolation;
    uint256 public blockedGatedRequestAttempts;
    uint256 public blockedGatedSettlementAttempts;
    uint256 public blockedLockedTransferAttempts;
    uint256 public blockedUnwhitelistedTransferAttempts;

    constructor(FundToken token_, NAVRegistry nav_, RiskRegistry risk_, bytes32 fundId_) {
        token = token_;
        nav = nav_;
        risk = risk_;
        fundId = fundId_;
        actors = [address(0x1001), address(0x1002), address(0x1003), address(0x1004)];
    }

    function actorCount() external pure returns (uint256) {
        return 4;
    }

    function actorAt(uint256 index) external view returns (address) {
        return actors[index];
    }

    function outsider() external pure returns (address) {
        return OUTSIDER;
    }

    function requestSubscription(uint256 actorSeed, uint256 amountSeed) external {
        _tick();
        token.requestSubscriptionFor(
            _actor(actorSeed), bound(amountSeed, MIN_SUBSCRIPTION_AMOUNT, MAX_SUBSCRIPTION_AMOUNT)
        );
    }

    function acceptSubscription(uint256 requestSeed) external {
        uint256 count = token.subscriptionRequestCount();
        if (count == 0) return;
        uint256 requestId = requestSeed % count;
        if (token.subscriptionRequestAt(requestId).accepted) return;

        _tick();
        token.acceptSubscription(requestId);
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 amountSeed) external {
        address from = _actor(fromSeed);
        address to = _differentActor(fromSeed, toSeed);
        uint256 available = token.balanceOf(from) - token.queuedRedemptionOf(from);
        if (available == 0) return;

        uint256 amount = bound(amountSeed, 1, available);
        _tick();
        vm.prank(from);
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        token.transfer(to, amount);
    }

    function attemptLockedTransfer(uint256 actorSeed) external {
        address actor = _actor(actorSeed);
        uint256 queued = token.queuedRedemptionOf(actor);
        if (queued == 0) return;

        uint256 available = token.balanceOf(actor) - queued;
        _tick();
        vm.prank(actor);
        vm.expectRevert(bytes("INSUFFICIENT_AVAILABLE_SHARES"));
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        token.transfer(_differentActor(actorSeed, actorSeed), available + 1);
        blockedLockedTransferAttempts += 1;
    }

    function attemptUnwhitelistedTransfer(uint256 actorSeed) external {
        address actor = _actor(actorSeed);
        uint256 available = token.balanceOf(actor) - token.queuedRedemptionOf(actor);
        if (available == 0) return;

        _tick();
        vm.prank(actor);
        vm.expectRevert(bytes("RECEIVER_NOT_WHITELISTED"));
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        token.transfer(OUTSIDER, 1);
        blockedUnwhitelistedTransferAttempts += 1;
    }

    function requestRedemption(uint256 actorSeed, uint256 amountSeed) external {
        address actor = _actor(actorSeed);
        uint256 available = token.balanceOf(actor) - token.queuedRedemptionOf(actor);
        if (available == 0) return;

        uint256 amount = bound(amountSeed, 1, available);
        _tick();
        if (risk.isGated(fundId)) {
            vm.expectRevert(bytes("REDEMPTION_GATED"));
            token.requestRedemptionFor(actor, amount);
            blockedGatedRequestAttempts += 1;
            return;
        }
        token.requestRedemptionFor(actor, amount);
    }

    function settleRedemption(uint256 requestSeed) external {
        uint256 count = token.redemptionRequestCount();
        if (count == 0) return;
        uint256 requestId = requestSeed % count;
        if (token.redemptionRequestAt(requestId).settled) return;

        _tick();
        if (risk.isGated(fundId)) {
            vm.expectRevert(bytes("REDEMPTION_GATED"));
            token.settleRedemption(requestId);
            blockedGatedSettlementAttempts += 1;
            return;
        }
        token.settleRedemption(requestId);
    }

    function postNAV(uint256 navSeed) external {
        uint256 supply = token.totalSupply();
        if (supply == 0) return;

        uint256 targetNav = bound(navSeed, MIN_NAV, MAX_NAV);
        uint256 netAssetValue = Math.mulDiv(supply, targetNav, token.NAV_SCALE());
        _tick();
        nav.postNAV(fundId, netAssetValue, supply, uint64(block.timestamp), keccak256(abi.encode(navSeed)));
    }

    function submitRiskMetrics(
        uint256 valuationSeed,
        uint256 pressureSeed,
        uint256 queueSeed,
        uint256 liquiditySeed,
        uint256 staleSeed,
        uint256 concentrationSeed
    ) external {
        RiskRegistry.RiskMetrics memory metrics = RiskRegistry.RiskMetrics({
            valuationHaircutBps: uint16(bound(valuationSeed, 0, 10_000)),
            redemptionPressureBps: uint16(bound(pressureSeed, 0, 10_000)),
            redemptionQueueRatioBps: uint16(bound(queueSeed, 0, 10_000)),
            liquidityShortfallBps: uint16(bound(liquiditySeed, 0, 10_000)),
            stalePricingRiskBps: uint16(bound(staleSeed, 0, 10_000)),
            investorConcentrationBps: uint16(bound(concentrationSeed, 0, 10_000))
        });
        bool wasGated = risk.isGated(fundId);
        _tick();
        risk.submitMetrics(
            fundId,
            metrics,
            risk.activeWeightsConfigId(),
            uint64(block.timestamp),
            keccak256(abi.encode(metrics, block.timestamp))
        );

        RiskRegistry.RiskSnapshot memory snapshot = risk.latestSnapshot(fundId);
        bool isGated = risk.isGated(fundId);
        bool shouldTrigger = snapshot.riskScoreBps > snapshot.kappaBps;
        if ((!wasGated && isGated != shouldTrigger) || (wasGated && !isGated)) {
            gateTransitionViolation = true;
        }
    }

    function releaseGate(uint256 reasonSeed) external {
        if (!risk.isGated(fundId)) return;
        _tick();
        risk.releaseGate(fundId, keccak256(abi.encode(reasonSeed, block.timestamp)));
    }

    function _actor(uint256 seed) private view returns (address) {
        return actors[seed % actors.length];
    }

    function _differentActor(uint256 actorSeed, uint256 otherSeed) private view returns (address) {
        uint256 fromIndex = actorSeed % actors.length;
        uint256 offset = 1 + (otherSeed % (actors.length - 1));
        return actors[(fromIndex + offset) % actors.length];
    }

    function _tick() private {
        vm.warp(block.timestamp + 1);
    }
}

contract LifecycleInvariantTest is StdInvariant, Test {
    FundToken private token;
    NAVRegistry private nav;
    RiskRegistry private risk;
    LifecycleHandler private handler;
    bytes32 private fundId;

    function setUp() public {
        vm.warp(1_710_000_000);
        fundId = keccak256("OTC_FUND_1");
        uint16[6] memory weights = [uint16(1_667), 1_667, 1_667, 1_667, 1_666, 1_666];
        risk = new RiskRegistry(address(this), weights, uint64(30 days), 7_000);
        nav = new NAVRegistry(address(this));
        nav.postInitialNAV(fundId, 1e18, uint64(block.timestamp), keccak256("initial nav"));
        token = new FundToken(address(this), "OTC Fund", "OTCF", fundId, address(nav));
        token.setRiskGate(address(risk));

        handler = new LifecycleHandler(token, nav, risk, fundId);
        token.grantRole(token.SUBSCRIPTION_ROLE(), address(handler));
        token.grantRole(token.REDEMPTION_ROLE(), address(handler));
        nav.grantRole(nav.MANAGER_ROLE(), address(handler));
        risk.grantRole(risk.RISK_ORACLE_ROLE(), address(handler));
        risk.grantRole(risk.REGULATOR_ROLE(), address(handler));

        for (uint256 i = 0; i < handler.actorCount(); i++) {
            address actor = handler.actorAt(i);
            token.setWhitelisted(actor, true, keccak256(abi.encode("eligibility", actor)));
        }

        bytes4[] memory selectors = new bytes4[](10);
        selectors[0] = handler.requestSubscription.selector;
        selectors[1] = handler.acceptSubscription.selector;
        selectors[2] = handler.transfer.selector;
        selectors[3] = handler.attemptLockedTransfer.selector;
        selectors[4] = handler.attemptUnwhitelistedTransfer.selector;
        selectors[5] = handler.requestRedemption.selector;
        selectors[6] = handler.settleRedemption.selector;
        selectors[7] = handler.postNAV.selector;
        selectors[8] = handler.submitRiskMetrics.selector;
        selectors[9] = handler.releaseGate.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_totalSupplyEqualsKnownHolderBalances() public view {
        uint256 holderBalanceSum;
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            holderBalanceSum += token.balanceOf(handler.actorAt(i));
        }
        assertEq(holderBalanceSum, token.totalSupply());
        assertEq(token.balanceOf(handler.outsider()), 0);
    }

    function invariant_queueMatchesHolderLocksAndPendingRequests() public view {
        uint256 holderQueueSum;
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            address actor = handler.actorAt(i);
            uint256 queued = token.queuedRedemptionOf(actor);
            assertLe(queued, token.balanceOf(actor));
            holderQueueSum += queued;
        }

        uint256 pendingRequestSum;
        for (uint256 i = 0; i < token.redemptionRequestCount(); i++) {
            FundToken.RedemptionRequest memory request = token.redemptionRequestAt(i);
            if (!request.settled) pendingRequestSum += request.redeemedShares;
        }
        assertEq(holderQueueSum, token.totalQueuedRedemption());
        assertEq(pendingRequestSum, token.totalQueuedRedemption());
    }

    function invariant_supplyMatchesAcceptedMintsMinusSettledBurns() public view {
        uint256 mintedShares;
        for (uint256 i = 0; i < token.subscriptionRequestCount(); i++) {
            FundToken.SubscriptionRequest memory request = token.subscriptionRequestAt(i);
            if (request.accepted) mintedShares += request.mintedShares;
        }

        uint256 burnedShares;
        for (uint256 i = 0; i < token.redemptionRequestCount(); i++) {
            FundToken.RedemptionRequest memory request = token.redemptionRequestAt(i);
            if (request.settled) burnedShares += request.redeemedShares;
        }
        assertLe(burnedShares, mintedShares);
        assertEq(mintedShares - burnedShares, token.totalSupply());
    }

    function invariant_riskScoresAndGateTransitionsRemainValid() public view {
        assertFalse(handler.gateTransitionViolation());
        for (uint256 i = 0; i < risk.historyLength(fundId); i++) {
            RiskRegistry.RiskSnapshot memory snapshot = risk.snapshotAt(fundId, i);
            assertLe(snapshot.riskScoreBps, risk.MAX_BPS());
        }
    }

    function invariant_navHistoryPreservesPricingFormula() public view {
        for (uint256 i = 0; i < nav.historyLength(fundId); i++) {
            NAVRegistry.NavRecord memory record = nav.navAt(fundId, i);
            if (record.isInitial) {
                assertEq(record.netAssetValue, 0);
                assertEq(record.totalSharesSnapshot, 0);
            } else {
                assertGt(record.totalSharesSnapshot, 0);
                assertEq(record.nav, Math.mulDiv(record.netAssetValue, token.NAV_SCALE(), record.totalSharesSnapshot));
            }
        }
    }
}
