// SPDX-License-Identifier: MIT
// Generated from scenarios.v1.json; do not edit by hand.
// Manifest-SHA256: 97eabdaab3de5cc4d3cb41bbce1b82e445edfa7c8ea060618dc7b51fa5be4c69
pragma solidity ^0.8.30;

import {AblationDifferentialHarness} from "./AblationDifferentialHarness.sol";

contract AblationM3Test is AblationDifferentialHarness {
    function testAblation_M3_V01() public {
        _assertAblation(_scenarioV01(), 3, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M3_V02() public {
        _assertAblation(_scenarioV02(), 3, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M3_V03() public {
        _assertAblation(_scenarioV03(), 3, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M3_V04() public {
        _assertAblation(_scenarioV04(), 3, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M3_V05() public {
        _assertAblation(_scenarioV05(), 3, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M3_V06() public {
        _assertAblation(_scenarioV06(), 3, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M3_V07() public {
        _assertAblation(_scenarioV07(), 3, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M3_V08() public {
        _assertAblation(_scenarioV08(), 3, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M3_V09() public {
        _assertAblation(_scenarioV09(), 3, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M3_V10() public {
        _assertAblation(_scenarioV10(), 3, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M3_V11() public {
        _assertAblation(_scenarioV11(), 3, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M3_V12() public {
        _assertAblation(_scenarioV12(), 3, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M3_V13() public {
        _assertAblation(_scenarioV13(), 3, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M3_V14() public {
        _assertAblation(_scenarioV14(), 3, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M3_V15() public {
        _assertAblation(_scenarioV15(), 3, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M3_V16() public {
        _assertAblation(_scenarioV16(), 3, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M3_V17() public {
        _assertAblation(_scenarioV17(), 3, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M3_V18() public {
        _assertAblation(_scenarioV18(), 3, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M3_I01() public {
        _assertAblation(
            _scenarioI01(),
            3,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, DEFAULT_ADMIN_ROLE
            )
        );
    }

    function testAblation_M3_I02() public {
        _assertAblation(
            _scenarioI02(),
            3,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, MANAGER_ROLE
            )
        );
    }

    function testAblation_M3_I03() public {
        _assertAblation(
            _scenarioI03(),
            3,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, SUBSCRIPTION_ROLE
            )
        );
    }

    function testAblation_M3_I04() public {
        _assertAblation(
            _scenarioI04(),
            3,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, REDEMPTION_ROLE
            )
        );
    }

    function testAblation_M3_I05() public {
        _assertAblation(
            _scenarioI05(),
            3,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, DEFAULT_ADMIN_ROLE
            )
        );
    }

    function testAblation_M3_I06() public {
        _assertAblation(
            _scenarioI06(),
            3,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "NOT_WHITELISTED")
        );
    }

    function testAblation_M3_I07() public {
        _assertAblation(
            _scenarioI07(),
            3,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "NOT_WHITELISTED")
        );
    }

    function testAblation_M3_I08() public {
        _assertAblation(
            _scenarioI08(),
            3,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "RECEIVER_NOT_WHITELISTED")
        );
    }

    function testAblation_M3_I09() public {
        _assertAblation(
            _scenarioI09(),
            3,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "NOT_WHITELISTED")
        );
    }

    function testAblation_M3_I10() public {
        _assertAblation(
            _scenarioI10(),
            3,
            true,
            ResultClass.RejectedByResidualGuard,
            abi.encodeWithSignature("Error(string)", "NO_NAV")
        );
    }

    function testAblation_M3_I11() public {
        _assertAblation(
            _scenarioI11(),
            3,
            true,
            ResultClass.InvalidTransitionAccepted,
            abi.encodeWithSignature("Error(string)", "NAV_NOT_INITIALIZED")
        );
    }

    function testAblation_M3_I12() public {
        _assertAblation(
            _scenarioI12(),
            3,
            true,
            ResultClass.InvalidTransitionAccepted,
            abi.encodeWithSignature("Error(string)", "NAV_ALREADY_INITIALIZED")
        );
    }

    function testAblation_M3_I13() public {
        _assertAblation(
            _scenarioI13(),
            3,
            true,
            ResultClass.InvalidTransitionAccepted,
            abi.encodeWithSignature("Error(string)", "AS_OF_BEFORE_LATEST")
        );
    }

    function testAblation_M3_I14() public {
        _assertAblation(
            _scenarioI14(), 3, false, ResultClass.ExpectedReject, abi.encodeWithSignature("Error(string)", "PAUSED")
        );
    }

    function testAblation_M3_I15() public {
        _assertAblation(
            _scenarioI15(), 3, false, ResultClass.ExpectedReject, abi.encodeWithSignature("Error(string)", "PAUSED")
        );
    }

    function testAblation_M3_I16() public {
        _assertAblation(
            _scenarioI16(), 3, false, ResultClass.ExpectedReject, abi.encodeWithSignature("Error(string)", "PAUSED")
        );
    }

    function testAblation_M3_I17() public {
        _assertAblation(
            _scenarioI17(), 3, false, ResultClass.ExpectedReject, abi.encodeWithSignature("Error(string)", "PAUSED")
        );
    }

    function testAblation_M3_I18() public {
        _assertAblation(
            _scenarioI18(),
            3,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "INVALID_SUBSCRIPTION_AMOUNT")
        );
    }

    function testAblation_M3_I19() public {
        _assertAblation(
            _scenarioI19(),
            3,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "SUBSCRIPTION_TOO_SMALL")
        );
    }

    function testAblation_M3_I20() public {
        _assertAblation(
            _scenarioI20(),
            3,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "SUBSCRIPTION_ALREADY_ACCEPTED")
        );
    }

    function testAblation_M3_I21() public {
        _assertAblation(
            _scenarioI21(),
            3,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "INVALID_REDEMPTION_AMOUNT")
        );
    }

    function testAblation_M3_I22() public {
        _assertAblation(
            _scenarioI22(),
            3,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "INSUFFICIENT_AVAILABLE_SHARES")
        );
    }

    function testAblation_M3_I23() public {
        _assertAblation(
            _scenarioI23(),
            3,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "INSUFFICIENT_AVAILABLE_SHARES")
        );
    }

    function testAblation_M3_I24() public {
        _assertAblation(
            _scenarioI24(),
            3,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "REDEMPTION_ALREADY_SETTLED")
        );
    }
}
