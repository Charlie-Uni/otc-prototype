// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test, Vm} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {FundToken} from "production/FundToken.sol";
import {NAVRegistry} from "production/NAVRegistry.sol";
import {RiskRegistry} from "production/RiskRegistry.sol";
import {ExperimentalFundToken} from "../generated/ExperimentalFundToken.sol";
import {ExperimentalNAVRegistry} from "../generated/ExperimentalNAVRegistry.sol";

abstract contract M0DifferentialHarness is Test {
    uint256 internal constant GENESIS_TIMESTAMP = 1_710_000_000;
    bytes32 internal constant FUND_ID = 0xac4a93645b61f4f102884f40e6a589263b542e97cda3dd28d1de825f80f90169;

    address internal constant ADMIN = 0x000000000000000000000000000000000000a001;
    address internal constant MANAGER = 0x000000000000000000000000000000000000A002;
    address internal constant SUBSCRIPTION_OPERATOR = 0x000000000000000000000000000000000000a003;
    address internal constant REDEMPTION_OPERATOR = 0x000000000000000000000000000000000000A004;
    address internal constant PAUSER = 0x000000000000000000000000000000000000A005;
    address internal constant OPERATOR_2 = 0x000000000000000000000000000000000000A006;
    address internal constant TRANSFER_OPERATOR = 0x000000000000000000000000000000000000a007;
    address internal constant ALICE = 0x000000000000000000000000000000000000a101;
    address internal constant BOB = 0x000000000000000000000000000000000000a102;
    address internal constant STRANGER = 0x000000000000000000000000000000000000aFfF;

    bytes32 internal constant DEFAULT_ADMIN_ROLE = bytes32(0);
    bytes32 internal constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 internal constant SUBSCRIPTION_ROLE = keccak256("SUBSCRIPTION_ROLE");
    bytes32 internal constant REDEMPTION_ROLE = keccak256("REDEMPTION_ROLE");
    bytes32 internal constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    enum Target {
        FundToken,
        NAVRegistry
    }

    struct Scenario {
        bytes32 id;
        uint8 fixtureId;
        Target target;
        address caller;
        bytes actionData;
        uint64 actionAtSec;
        bool shouldAccept;
        bytes expectedRevert;
    }

    struct ArmResult {
        address riskRegistry;
        address navRegistry;
        address fundToken;
        bool accepted;
        bytes resultData;
        bytes32 stateDigest;
        bytes32 eventDigest;
    }

    struct PredicateFlags {
        bool authorized;
        bool compliance;
        bool navValidity;
        bool lifecycleStatus;
        bool parameterConsistency;
    }

    address internal riskRegistry;
    address internal navRegistry;
    address internal fundToken;

    event M0Equivalent(bytes32 indexed scenarioId, bool accepted, bytes32 stateDigest, bytes32 eventDigest);

    function _applyFixture(uint8 fixtureId) internal virtual;

    function _assertM0(Scenario memory scenario) internal {
        vm.chainId(31_337);
        vm.warp(GENESIS_TIMESTAMP);
        vm.roll(1);
        uint256 cleanState = vm.snapshotState();
        PredicateFlags memory allEnabled = _allPredicatesEnabled();
        ArmResult memory production = _runArm(false, allEnabled, scenario);
        assertTrue(vm.revertToState(cleanState), "PRODUCTION_SNAPSHOT_RESTORE_FAILED");
        ArmResult memory experimental = _runArm(true, allEnabled, scenario);

        assertEq(experimental.riskRegistry, production.riskRegistry, "RISK_REGISTRY_ADDRESS_DIVERGENCE");
        assertEq(experimental.navRegistry, production.navRegistry, "NAV_REGISTRY_ADDRESS_DIVERGENCE");
        assertEq(experimental.fundToken, production.fundToken, "FUND_TOKEN_ADDRESS_DIVERGENCE");
        assertEq(experimental.accepted, production.accepted, "OUTCOME_DIVERGENCE");
        assertEq(experimental.resultData, production.resultData, "CALL_RESULT_DIVERGENCE");
        assertEq(experimental.stateDigest, production.stateDigest, "STATE_DIVERGENCE");
        assertEq(experimental.eventDigest, production.eventDigest, "EVENT_DIVERGENCE");

        assertEq(production.accepted, scenario.shouldAccept, "PREREGISTERED_OUTCOME_MISMATCH");
        if (!scenario.shouldAccept) {
            assertEq(production.resultData, scenario.expectedRevert, "PREREGISTERED_ERROR_MISMATCH");
        }

        emit M0Equivalent(scenario.id, production.accepted, production.stateDigest, production.eventDigest);
        console2.log(string.concat("m0.scenario=", vm.toString(scenario.id)));
        console2.log(string.concat("m0.stateDigest=", vm.toString(production.stateDigest)));
        console2.log(string.concat("m0.eventDigest=", vm.toString(production.eventDigest)));
    }

    function _runArm(bool experimental, PredicateFlags memory flags, Scenario memory scenario)
        internal
        returns (ArmResult memory result)
    {
        _deployArm(experimental, flags);
        _applyFixture(scenario.fixtureId);
        bytes32 beforeDigest = _stateDigest();

        _advanceTo(scenario.actionAtSec);
        vm.recordLogs();
        vm.prank(scenario.caller);
        (result.accepted, result.resultData) = _target(scenario.target).call(scenario.actionData);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        if (!result.accepted) {
            // Reverted EVM transactions have no receipt logs, even if the cheatcode
            // observed an emit before the frame reverted.
            logs = new Vm.Log[](0);
        }

        result.riskRegistry = riskRegistry;
        result.navRegistry = navRegistry;
        result.fundToken = fundToken;
        result.stateDigest = _stateDigest();
        result.eventDigest = _eventDigest(logs);
        if (!result.accepted) {
            assertEq(result.stateDigest, beforeDigest, "REJECTED_OPERATION_MUTATED_STATE");
        }
    }

    function _deployArm(bool experimental, PredicateFlags memory flags) private {
        uint16[6] memory weights = [uint16(1667), 1667, 1667, 1667, 1666, 1666];

        _advanceTo(10);
        riskRegistry = address(new RiskRegistry(ADMIN, weights, 30 days, 7_000));

        _advanceTo(20);
        if (experimental) {
            navRegistry = address(
                new ExperimentalNAVRegistry(ADMIN, flags.authorized, flags.navValidity, flags.parameterConsistency)
            );
        } else {
            navRegistry = address(new NAVRegistry(ADMIN));
        }

        _advanceTo(30);
        if (experimental) {
            fundToken = address(
                new ExperimentalFundToken(
                    ADMIN,
                    "OTC Fund Share",
                    "OTCF",
                    FUND_ID,
                    navRegistry,
                    flags.authorized,
                    flags.compliance,
                    flags.navValidity,
                    flags.lifecycleStatus,
                    flags.parameterConsistency
                )
            );
        } else {
            fundToken = address(new FundToken(ADMIN, "OTC Fund Share", "OTCF", FUND_ID, navRegistry));
        }

        _mustCallAt(40, Target.FundToken, ADMIN, abi.encodeWithSignature("setRiskGate(address)", riskRegistry));
        _mustCallAt(
            42, Target.NAVRegistry, ADMIN, abi.encodeWithSignature("grantRole(bytes32,address)", MANAGER_ROLE, MANAGER)
        );
        _mustCallAt(
            44,
            Target.FundToken,
            ADMIN,
            abi.encodeWithSignature("grantRole(bytes32,address)", SUBSCRIPTION_ROLE, SUBSCRIPTION_OPERATOR)
        );
        _mustCallAt(
            46,
            Target.FundToken,
            ADMIN,
            abi.encodeWithSignature("grantRole(bytes32,address)", REDEMPTION_ROLE, REDEMPTION_OPERATOR)
        );
        _mustCallAt(
            48, Target.FundToken, ADMIN, abi.encodeWithSignature("grantRole(bytes32,address)", PAUSER_ROLE, PAUSER)
        );
    }

    function _mustCallAt(uint64 atSec, Target target, address caller, bytes memory callData) internal {
        _advanceTo(atSec);
        vm.prank(caller);
        (bool success, bytes memory returnData) = _target(target).call(callData);
        if (!success) {
            assembly ("memory-safe") {
                revert(add(returnData, 0x20), mload(returnData))
            }
        }
    }

    function _advanceTo(uint64 atSec) private {
        vm.warp(GENESIS_TIMESTAMP + atSec);
        vm.roll(block.number + 1);
    }

    function _target(Target target) private view returns (address) {
        return target == Target.FundToken ? fundToken : navRegistry;
    }

    function _stateDigest() private view returns (bytes32) {
        bytes memory projection = abi.encode(
            _read(fundToken, abi.encodeWithSignature("totalSupply()")),
            _read(fundToken, abi.encodeWithSignature("subscriptionRequestCount()")),
            _read(fundToken, abi.encodeWithSignature("redemptionRequestCount()")),
            _read(fundToken, abi.encodeWithSignature("totalQueuedRedemption()")),
            _read(fundToken, abi.encodeWithSignature("paused()")),
            _read(fundToken, abi.encodeWithSignature("fundId()")),
            _read(fundToken, abi.encodeWithSignature("navRegistry()")),
            _read(fundToken, abi.encodeWithSignature("riskGate()")),
            _read(riskRegistry, abi.encodeWithSignature("isGated(bytes32)", FUND_ID))
        );

        address[10] memory actors = _actors();
        for (uint256 i = 0; i < actors.length; ++i) {
            projection = bytes.concat(
                projection,
                _read(fundToken, abi.encodeWithSignature("balanceOf(address)", actors[i])),
                _read(fundToken, abi.encodeWithSignature("whitelist(address)", actors[i])),
                _roleProjection(fundToken, actors[i]),
                _roleProjection(navRegistry, actors[i])
            );
            for (uint256 j = 0; j < actors.length; ++j) {
                projection = bytes.concat(
                    projection,
                    _read(fundToken, abi.encodeWithSignature("allowance(address,address)", actors[i], actors[j]))
                );
            }
        }

        projection = bytes.concat(
            projection,
            _read(fundToken, abi.encodeWithSignature("queuedRedemptionOf(address)", ALICE)),
            _read(fundToken, abi.encodeWithSignature("queuedRedemptionOf(address)", BOB))
        );

        uint256 subscriptionCount =
            abi.decode(_read(fundToken, abi.encodeWithSignature("subscriptionRequestCount()")), (uint256));
        for (uint256 i = 0; i < subscriptionCount; ++i) {
            projection = bytes.concat(
                projection, _read(fundToken, abi.encodeWithSignature("subscriptionRequestAt(uint256)", i))
            );
        }

        uint256 redemptionCount =
            abi.decode(_read(fundToken, abi.encodeWithSignature("redemptionRequestCount()")), (uint256));
        for (uint256 i = 0; i < redemptionCount; ++i) {
            projection =
                bytes.concat(projection, _read(fundToken, abi.encodeWithSignature("redemptionRequestAt(uint256)", i)));
        }

        uint256 navCount =
            abi.decode(_read(navRegistry, abi.encodeWithSignature("historyLength(bytes32)", FUND_ID)), (uint256));
        projection = bytes.concat(projection, abi.encode(navCount));
        for (uint256 i = 0; i < navCount; ++i) {
            projection = bytes.concat(
                projection, _read(navRegistry, abi.encodeWithSignature("navAt(bytes32,uint256)", FUND_ID, i))
            );
        }
        return keccak256(projection);
    }

    function _roleProjection(address target, address actor) private view returns (bytes memory) {
        if (target == fundToken) {
            return abi.encode(
                _read(target, abi.encodeWithSignature("hasRole(bytes32,address)", DEFAULT_ADMIN_ROLE, actor)),
                _read(target, abi.encodeWithSignature("hasRole(bytes32,address)", SUBSCRIPTION_ROLE, actor)),
                _read(target, abi.encodeWithSignature("hasRole(bytes32,address)", REDEMPTION_ROLE, actor)),
                _read(target, abi.encodeWithSignature("hasRole(bytes32,address)", PAUSER_ROLE, actor))
            );
        }
        return abi.encode(
            _read(target, abi.encodeWithSignature("hasRole(bytes32,address)", DEFAULT_ADMIN_ROLE, actor)),
            _read(target, abi.encodeWithSignature("hasRole(bytes32,address)", MANAGER_ROLE, actor))
        );
    }

    function _read(address target, bytes memory callData) private view returns (bytes memory returnData) {
        (bool success, bytes memory data) = target.staticcall(callData);
        assertTrue(success, "STATE_PROJECTION_READ_FAILED");
        return data;
    }

    function _eventDigest(Vm.Log[] memory logs) private pure returns (bytes32 digest) {
        bytes memory projection;
        for (uint256 i = 0; i < logs.length; ++i) {
            projection = bytes.concat(projection, abi.encode(logs[i].emitter, logs[i].topics, logs[i].data));
        }
        return keccak256(projection);
    }

    function _actors() private pure returns (address[10] memory actors) {
        actors = [
            ADMIN,
            MANAGER,
            SUBSCRIPTION_OPERATOR,
            REDEMPTION_OPERATOR,
            PAUSER,
            OPERATOR_2,
            TRANSFER_OPERATOR,
            ALICE,
            BOB,
            STRANGER
        ];
    }

    function _allPredicatesEnabled() internal pure returns (PredicateFlags memory) {
        return PredicateFlags({
            authorized: true, compliance: true, navValidity: true, lifecycleStatus: true, parameterConsistency: true
        });
    }
}
