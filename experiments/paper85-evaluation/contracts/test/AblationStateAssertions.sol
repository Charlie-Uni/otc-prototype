// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// Generated from the sealed scenario prose through state-assertions.v2.json.
// Source manifest SHA-256: 97eabdaab3de5cc4d3cb41bbce1b82e445edfa7c8ea060618dc7b51fa5be4c69
// Typed assertion spec SHA-256: 9d3a94b32a0481e937be2f4bbc539b692e3dc5748d4191f5242f6defaa258057

import {StateObservation} from "./M0DifferentialHarness.sol";

library AblationStateAssertions {
    error StateAssertionFailed(bytes32 scenarioId);
    error UnknownTargetScenario(bytes32 scenarioId);

    function verify(
        bytes32 scenarioId,
        StateObservation memory baseline,
        StateObservation memory ablated,
        bytes32 baselineBeforeStateDigest,
        bytes32 baselineStateDigest,
        bytes32 ablatedBeforeStateDigest,
        bytes32 ablatedStateDigest
    ) internal pure {
        bool matches;
        if (scenarioId == bytes32("I01")) {
            matches = baseline.aliceWhitelisted == false && ablated.aliceWhitelisted == true;
        } else if (scenarioId == bytes32("I02")) {
            matches = baseline.navHistoryLength == 0 && ablated.navHistoryLength == 1;
        } else if (scenarioId == bytes32("I03")) {
            matches = baseline.totalSupply == 0 && ablated.totalSupply == 100000000000000000000;
        } else if (scenarioId == bytes32("I04")) {
            matches = baseline.redemption0Settled == false && ablated.redemption0Settled == true;
        } else if (scenarioId == bytes32("I05")) {
            matches = baseline.operator2SubscriptionRole == false && ablated.operator2SubscriptionRole == true;
        } else if (scenarioId == bytes32("I06")) {
            matches = ablated.subscriptionRequestCount == (baseline.subscriptionRequestCount + 1);
        } else if (scenarioId == bytes32("I07")) {
            matches = baseline.totalSupply == 0 && ablated.totalSupply > 0 && ablated.aliceWhitelisted == false;
        } else if (scenarioId == bytes32("I08")) {
            matches = baseline.bobBalance == 0 && ablated.bobBalance > 0;
        } else if (scenarioId == bytes32("I09")) {
            matches =
                ablated.totalQueuedRedemption > baseline.totalQueuedRedemption && ablated.aliceWhitelisted == false;
        } else if (scenarioId == bytes32("I10")) {
            matches = baseline.totalSupply == 0 && ablated.totalSupply == 0 && baselineStateDigest == ablatedStateDigest;
        } else if (scenarioId == bytes32("I11")) {
            matches =
                baseline.navHistoryLength == 0 && ablated.navHistoryLength == 1 && ablated.latestNavIsInitial == false;
        } else if (scenarioId == bytes32("I12")) {
            matches =
                baseline.navHistoryLength == 1 && ablated.navHistoryLength == 2 && ablated.latestNavIsInitial == true;
        } else if (scenarioId == bytes32("I13")) {
            matches = ablated.latestNavAsOf < baseline.latestNavAsOf;
        } else if (scenarioId == bytes32("I14")) {
            matches = baseline.paused == true && ablated.paused == true && ablated.aliceBalance != baseline.aliceBalance
                && ablated.bobBalance != baseline.bobBalance;
        } else if (scenarioId == bytes32("I15")) {
            matches = baseline.paused == true && ablated.paused == true && baseline.totalSupply == 0
                && ablated.totalSupply > 0;
        } else if (scenarioId == bytes32("I16")) {
            matches = baseline.paused == true && ablated.paused == true && ablated.totalSupply < baseline.totalSupply;
        } else if (scenarioId == bytes32("I17")) {
            matches = baseline.paused == true && ablated.paused == true && ablated.aliceBalance != baseline.aliceBalance
                && ablated.bobBalance != baseline.bobBalance;
        } else if (scenarioId == bytes32("I18")) {
            matches = ablated.subscriptionRequestCount == (baseline.subscriptionRequestCount + 1)
                && ablated.subscription0Amount == 0;
        } else if (scenarioId == bytes32("I19")) {
            matches = baseline.subscription0Accepted == false && ablated.subscription0Accepted == true
                && ablated.subscription0MintedShares == 0;
        } else if (scenarioId == bytes32("I20")) {
            matches = baseline.subscription0Accepted == true && ablated.subscription0Accepted == true
                && ablated.subscription0MintedShares == baseline.subscription0MintedShares
                && ablated.totalSupply == (baseline.totalSupply + baseline.subscription0MintedShares);
        } else if (scenarioId == bytes32("I21")) {
            matches = ablated.redemptionRequestCount == (baseline.redemptionRequestCount + 1)
                && ablated.totalQueuedRedemption == baseline.totalQueuedRedemption;
        } else if (scenarioId == bytes32("I22")) {
            matches = ablated.aliceQueued > baseline.aliceQueued && ablated.aliceQueued > ablated.aliceBalance;
        } else if (scenarioId == bytes32("I23")) {
            matches = ablated.aliceQueued == baseline.aliceQueued && ablated.aliceBalance < baseline.aliceBalance
                && ablated.aliceBalance < ablated.aliceQueued;
        } else if (scenarioId == bytes32("I24")) {
            matches = baselineBeforeStateDigest == baselineStateDigest && ablatedBeforeStateDigest == ablatedStateDigest
                && baselineStateDigest == ablatedStateDigest;
        } else {
            revert UnknownTargetScenario(scenarioId);
        }

        if (!matches) revert StateAssertionFailed(scenarioId);
    }
}
