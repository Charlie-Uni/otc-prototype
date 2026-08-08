// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {StateObservation} from "./M0DifferentialHarness.sol";

library AblationStateAssertions {
    error StateAssertionFailed(bytes32 scenarioId);
    error UnknownTargetScenario(bytes32 scenarioId);

    function verify(
        bytes32 scenarioId,
        StateObservation memory baseline,
        StateObservation memory ablated,
        bytes32 baselineDigest,
        bytes32 ablatedDigest
    ) internal pure {
        bool matches;
        if (scenarioId == bytes32("I01")) {
            matches = !baseline.aliceWhitelisted && ablated.aliceWhitelisted;
        } else if (scenarioId == bytes32("I02")) {
            matches = baseline.navHistoryLength == 0 && ablated.navHistoryLength == 1;
        } else if (scenarioId == bytes32("I03")) {
            matches = baseline.totalSupply == 0 && ablated.totalSupply == 100 ether;
        } else if (scenarioId == bytes32("I04")) {
            matches = !baseline.redemption0Settled && ablated.redemption0Settled;
        } else if (scenarioId == bytes32("I05")) {
            matches = !baseline.operator2SubscriptionRole && ablated.operator2SubscriptionRole;
        } else if (scenarioId == bytes32("I06")) {
            matches = ablated.subscriptionRequestCount == baseline.subscriptionRequestCount + 1;
        } else if (scenarioId == bytes32("I07")) {
            matches = baseline.totalSupply == 0 && ablated.totalSupply > 0 && !ablated.aliceWhitelisted;
        } else if (scenarioId == bytes32("I08")) {
            matches = baseline.bobBalance == 0 && ablated.bobBalance > 0;
        } else if (scenarioId == bytes32("I09")) {
            matches = ablated.totalQueuedRedemption > baseline.totalQueuedRedemption && !ablated.aliceWhitelisted;
        } else if (scenarioId == bytes32("I10")) {
            matches = baseline.totalSupply == 0 && ablated.totalSupply == 0 && baselineDigest == ablatedDigest;
        } else if (scenarioId == bytes32("I11")) {
            matches = baseline.navHistoryLength == 0 && ablated.navHistoryLength == 1 && !ablated.latestNavIsInitial;
        } else if (scenarioId == bytes32("I12")) {
            matches = baseline.navHistoryLength == 1 && ablated.navHistoryLength == 2 && ablated.latestNavIsInitial;
        } else if (scenarioId == bytes32("I13")) {
            matches = ablated.latestNavAsOf < baseline.latestNavAsOf;
        } else if (scenarioId == bytes32("I14")) {
            matches = ablated.aliceBalance != baseline.aliceBalance && ablated.bobBalance != baseline.bobBalance;
        } else if (scenarioId == bytes32("I15")) {
            matches = baseline.totalSupply == 0 && ablated.totalSupply > 0;
        } else if (scenarioId == bytes32("I16")) {
            matches = ablated.totalSupply < baseline.totalSupply;
        } else if (scenarioId == bytes32("I17")) {
            matches = ablated.aliceBalance != baseline.aliceBalance && ablated.bobBalance != baseline.bobBalance;
        } else if (scenarioId == bytes32("I18")) {
            matches = ablated.subscriptionRequestCount == baseline.subscriptionRequestCount + 1;
        } else if (scenarioId == bytes32("I19")) {
            matches = !baseline.subscription0Accepted && ablated.subscription0Accepted
                && ablated.subscription0MintedShares == 0;
        } else if (scenarioId == bytes32("I20")) {
            matches = ablated.totalSupply > baseline.totalSupply;
        } else if (scenarioId == bytes32("I21")) {
            matches = ablated.redemptionRequestCount == baseline.redemptionRequestCount + 1
                && ablated.totalQueuedRedemption == baseline.totalQueuedRedemption;
        } else if (scenarioId == bytes32("I22")) {
            matches = ablated.aliceQueued > baseline.aliceQueued && ablated.aliceQueued > ablated.aliceBalance;
        } else if (scenarioId == bytes32("I23")) {
            matches = ablated.aliceQueued == baseline.aliceQueued && ablated.aliceBalance < baseline.aliceBalance
                && ablated.aliceBalance < ablated.aliceQueued;
        } else if (scenarioId == bytes32("I24")) {
            matches =
                keccak256(abi.encode(baseline)) == keccak256(abi.encode(ablated)) && baselineDigest == ablatedDigest;
        } else {
            revert UnknownTargetScenario(scenarioId);
        }

        if (!matches) revert StateAssertionFailed(scenarioId);
    }
}
