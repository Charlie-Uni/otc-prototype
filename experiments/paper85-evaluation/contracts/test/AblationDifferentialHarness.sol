// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {console2} from "forge-std/console2.sol";
import {StateObservation} from "./M0DifferentialHarness.sol";
import {ScenarioFixtures} from "./ScenarioFixtures.sol";
import {AblationStateAssertions} from "./AblationStateAssertions.sol";

abstract contract AblationDifferentialHarness is ScenarioFixtures {
    enum ResultClass {
        ExpectedAccept,
        ExpectedReject,
        InvalidTransitionAccepted,
        RejectedByResidualGuard,
        RuntimeRevert,
        StateDivergence,
        EventDivergence
    }

    function _assertAblation(
        Scenario memory scenario,
        uint8 variant,
        bool targeted,
        ResultClass expectedClass,
        bytes memory expectedAblationError
    ) internal {
        vm.chainId(31_337);
        vm.warp(GENESIS_TIMESTAMP);
        vm.roll(1);
        uint256 cleanState = vm.snapshotState();

        ArmResult memory baseline = _runArm(true, _allPredicatesEnabled(), scenario);
        assertTrue(vm.revertToState(cleanState), "M0_SNAPSHOT_RESTORE_FAILED");
        ArmResult memory ablated = _runArm(true, _flagsForVariant(variant), scenario);

        assertEq(ablated.riskRegistry, baseline.riskRegistry, "RISK_REGISTRY_ADDRESS_DIVERGENCE");
        assertEq(ablated.navRegistry, baseline.navRegistry, "NAV_REGISTRY_ADDRESS_DIVERGENCE");
        assertEq(ablated.fundToken, baseline.fundToken, "FUND_TOKEN_ADDRESS_DIVERGENCE");

        bool stateDivergence = ablated.stateDigest != baseline.stateDigest;
        bool eventDivergence = ablated.eventDigest != baseline.eventDigest;
        ResultClass observed = _classify(targeted, baseline, ablated, stateDivergence, eventDivergence);
        assertEq(uint256(observed), uint256(expectedClass), "ABLATION_CLASSIFICATION_MISMATCH");

        if (!targeted) {
            assertEq(ablated.accepted, baseline.accepted, "NON_TARGET_OUTCOME_DIVERGENCE");
            assertEq(ablated.resultData, baseline.resultData, "NON_TARGET_RESULT_DIVERGENCE");
            assertFalse(stateDivergence, "NON_TARGET_STATE_DIVERGENCE");
            assertFalse(eventDivergence, "NON_TARGET_EVENT_DIVERGENCE");
        } else if (!ablated.accepted) {
            assertEq(ablated.resultData, expectedAblationError, "PREREGISTERED_ABLATION_ERROR_MISMATCH");
        }

        if (targeted) {
            AblationStateAssertions.verify(
                scenario.id,
                baseline.state,
                ablated.state,
                baseline.beforeStateDigest,
                baseline.stateDigest,
                ablated.beforeStateDigest,
                ablated.stateDigest
            );
            _logStateObservation("baseline", baseline.state);
            _logStateObservation("ablated", ablated.state);
            console2.log(string.concat("ablation.baseline.beforeStateDigest=", vm.toString(baseline.beforeStateDigest)));
            console2.log(string.concat("ablation.ablated.beforeStateDigest=", vm.toString(ablated.beforeStateDigest)));
            console2.log("ablation.stateAssertionVerified=true");
        }

        console2.log(string.concat("ablation.scenario=", vm.toString(scenario.id)));
        console2.log(string.concat("ablation.variant=M", vm.toString(variant)));
        console2.log(string.concat("ablation.classification=", _className(observed)));
        console2.log(string.concat("ablation.stateDivergence=", vm.toString(stateDivergence)));
        console2.log(string.concat("ablation.eventDivergence=", vm.toString(eventDivergence)));
        console2.log(string.concat("ablation.stateDigest=", vm.toString(ablated.stateDigest)));
        console2.log(string.concat("ablation.eventDigest=", vm.toString(ablated.eventDigest)));
    }

    function _logStateObservation(string memory arm, StateObservation memory state) private pure {
        string memory prefix = string.concat("ablation.", arm, ".");
        console2.log(string.concat(prefix, "totalSupply=", vm.toString(state.totalSupply)));
        console2.log(string.concat(prefix, "subscriptionRequestCount=", vm.toString(state.subscriptionRequestCount)));
        console2.log(string.concat(prefix, "redemptionRequestCount=", vm.toString(state.redemptionRequestCount)));
        console2.log(string.concat(prefix, "totalQueuedRedemption=", vm.toString(state.totalQueuedRedemption)));
        console2.log(string.concat(prefix, "aliceBalance=", vm.toString(state.aliceBalance)));
        console2.log(string.concat(prefix, "bobBalance=", vm.toString(state.bobBalance)));
        console2.log(string.concat(prefix, "aliceQueued=", vm.toString(state.aliceQueued)));
        console2.log(string.concat(prefix, "bobQueued=", vm.toString(state.bobQueued)));
        console2.log(string.concat(prefix, "aliceWhitelisted=", vm.toString(state.aliceWhitelisted)));
        console2.log(string.concat(prefix, "bobWhitelisted=", vm.toString(state.bobWhitelisted)));
        console2.log(string.concat(prefix, "operator2SubscriptionRole=", vm.toString(state.operator2SubscriptionRole)));
        console2.log(string.concat(prefix, "paused=", vm.toString(state.paused)));
        console2.log(string.concat(prefix, "navHistoryLength=", vm.toString(state.navHistoryLength)));
        console2.log(string.concat(prefix, "latestNavAsOf=", vm.toString(state.latestNavAsOf)));
        console2.log(string.concat(prefix, "latestNavIsInitial=", vm.toString(state.latestNavIsInitial)));
        console2.log(string.concat(prefix, "subscription0Amount=", vm.toString(state.subscription0Amount)));
        console2.log(string.concat(prefix, "subscription0Accepted=", vm.toString(state.subscription0Accepted)));
        console2.log(string.concat(prefix, "subscription0MintedShares=", vm.toString(state.subscription0MintedShares)));
        console2.log(string.concat(prefix, "redemption0Settled=", vm.toString(state.redemption0Settled)));
    }

    function _classify(
        bool targeted,
        ArmResult memory baseline,
        ArmResult memory ablated,
        bool stateDivergence,
        bool eventDivergence
    ) private pure returns (ResultClass) {
        if (targeted && !baseline.accepted && ablated.accepted) {
            return ResultClass.InvalidTransitionAccepted;
        }
        if (targeted && !ablated.accepted) {
            return _isPanic(ablated.resultData) ? ResultClass.RuntimeRevert : ResultClass.RejectedByResidualGuard;
        }
        if (baseline.accepted != ablated.accepted) {
            return ablated.accepted ? ResultClass.InvalidTransitionAccepted : ResultClass.RuntimeRevert;
        }
        if (stateDivergence) return ResultClass.StateDivergence;
        if (eventDivergence) return ResultClass.EventDivergence;
        return baseline.accepted ? ResultClass.ExpectedAccept : ResultClass.ExpectedReject;
    }

    function _isPanic(bytes memory resultData) private pure returns (bool) {
        if (resultData.length < 4) return false;
        bytes4 selector;
        assembly ("memory-safe") {
            selector := mload(add(resultData, 0x20))
        }
        return selector == bytes4(keccak256("Panic(uint256)"));
    }

    function _flagsForVariant(uint8 variant) private pure returns (PredicateFlags memory flags) {
        require(variant >= 1 && variant <= 5, "UNKNOWN_ABLATION_VARIANT");
        flags = _allPredicatesEnabled();
        if (variant == 1) flags.authorized = false;
        else if (variant == 2) flags.compliance = false;
        else if (variant == 3) flags.navValidity = false;
        else if (variant == 4) flags.lifecycleStatus = false;
        else flags.parameterConsistency = false;
    }

    function _className(ResultClass classification) private pure returns (string memory) {
        if (classification == ResultClass.ExpectedAccept) return "expected_accept";
        if (classification == ResultClass.ExpectedReject) return "expected_reject";
        if (classification == ResultClass.InvalidTransitionAccepted) return "invalid_transition_accepted";
        if (classification == ResultClass.RejectedByResidualGuard) return "rejected_by_residual_guard";
        if (classification == ResultClass.RuntimeRevert) return "runtime_revert";
        if (classification == ResultClass.StateDivergence) return "state_divergence";
        return "event_divergence";
    }
}
