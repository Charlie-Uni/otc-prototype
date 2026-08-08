// SPDX-License-Identifier: MIT
// Generated from scenarios.v1.json; do not edit by hand.
// Manifest-SHA256: 97eabdaab3de5cc4d3cb41bbce1b82e445edfa7c8ea060618dc7b51fa5be4c69
pragma solidity ^0.8.30;

import {AblationDifferentialHarness} from "./AblationDifferentialHarness.sol";

contract AblationM4Test is AblationDifferentialHarness {
    function testAblation_M4_V01() public {
        _assertAblation(_scenarioV01(), 4, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M4_V02() public {
        _assertAblation(_scenarioV02(), 4, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M4_V03() public {
        _assertAblation(_scenarioV03(), 4, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M4_V04() public {
        _assertAblation(_scenarioV04(), 4, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M4_V05() public {
        _assertAblation(_scenarioV05(), 4, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M4_V06() public {
        _assertAblation(_scenarioV06(), 4, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M4_V07() public {
        _assertAblation(_scenarioV07(), 4, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M4_V08() public {
        _assertAblation(_scenarioV08(), 4, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M4_V09() public {
        _assertAblation(_scenarioV09(), 4, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M4_V10() public {
        _assertAblation(_scenarioV10(), 4, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M4_V11() public {
        _assertAblation(_scenarioV11(), 4, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M4_V12() public {
        _assertAblation(_scenarioV12(), 4, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M4_V13() public {
        _assertAblation(_scenarioV13(), 4, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M4_V14() public {
        _assertAblation(_scenarioV14(), 4, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M4_V15() public {
        _assertAblation(_scenarioV15(), 4, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M4_V16() public {
        _assertAblation(_scenarioV16(), 4, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M4_V17() public {
        _assertAblation(_scenarioV17(), 4, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M4_V18() public {
        _assertAblation(_scenarioV18(), 4, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M4_I01() public {
        _assertAblation(
            _scenarioI01(),
            4,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, DEFAULT_ADMIN_ROLE
            )
        );
    }

    function testAblation_M4_I02() public {
        _assertAblation(
            _scenarioI02(),
            4,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, MANAGER_ROLE
            )
        );
    }

    function testAblation_M4_I03() public {
        _assertAblation(
            _scenarioI03(),
            4,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, SUBSCRIPTION_ROLE
            )
        );
    }

    function testAblation_M4_I04() public {
        _assertAblation(
            _scenarioI04(),
            4,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, REDEMPTION_ROLE
            )
        );
    }

    function testAblation_M4_I05() public {
        _assertAblation(
            _scenarioI05(),
            4,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, DEFAULT_ADMIN_ROLE
            )
        );
    }

    function testAblation_M4_I06() public {
        _assertAblation(
            _scenarioI06(),
            4,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "NOT_WHITELISTED")
        );
    }

    function testAblation_M4_I07() public {
        _assertAblation(
            _scenarioI07(),
            4,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "NOT_WHITELISTED")
        );
    }

    function testAblation_M4_I08() public {
        _assertAblation(
            _scenarioI08(),
            4,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "RECEIVER_NOT_WHITELISTED")
        );
    }

    function testAblation_M4_I09() public {
        _assertAblation(
            _scenarioI09(),
            4,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "NOT_WHITELISTED")
        );
    }

    function testAblation_M4_I10() public {
        _assertAblation(
            _scenarioI10(), 4, false, ResultClass.ExpectedReject, abi.encodeWithSignature("Error(string)", "NO_NAV")
        );
    }

    function testAblation_M4_I11() public {
        _assertAblation(
            _scenarioI11(),
            4,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "NAV_NOT_INITIALIZED")
        );
    }

    function testAblation_M4_I12() public {
        _assertAblation(
            _scenarioI12(),
            4,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "NAV_ALREADY_INITIALIZED")
        );
    }

    function testAblation_M4_I13() public {
        _assertAblation(
            _scenarioI13(),
            4,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "AS_OF_BEFORE_LATEST")
        );
    }

    function testAblation_M4_I14() public {
        _assertAblation(
            _scenarioI14(),
            4,
            true,
            ResultClass.InvalidTransitionAccepted,
            abi.encodeWithSignature("Error(string)", "PAUSED")
        );
    }

    function testAblation_M4_I15() public {
        _assertAblation(
            _scenarioI15(),
            4,
            true,
            ResultClass.InvalidTransitionAccepted,
            abi.encodeWithSignature("Error(string)", "PAUSED")
        );
    }

    function testAblation_M4_I16() public {
        _assertAblation(
            _scenarioI16(),
            4,
            true,
            ResultClass.InvalidTransitionAccepted,
            abi.encodeWithSignature("Error(string)", "PAUSED")
        );
    }

    function testAblation_M4_I17() public {
        _assertAblation(
            _scenarioI17(),
            4,
            true,
            ResultClass.InvalidTransitionAccepted,
            abi.encodeWithSignature("Error(string)", "PAUSED")
        );
    }

    function testAblation_M4_I18() public {
        _assertAblation(
            _scenarioI18(),
            4,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "INVALID_SUBSCRIPTION_AMOUNT")
        );
    }

    function testAblation_M4_I19() public {
        _assertAblation(
            _scenarioI19(),
            4,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "SUBSCRIPTION_TOO_SMALL")
        );
    }

    function testAblation_M4_I20() public {
        _assertAblation(
            _scenarioI20(),
            4,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "SUBSCRIPTION_ALREADY_ACCEPTED")
        );
    }

    function testAblation_M4_I21() public {
        _assertAblation(
            _scenarioI21(),
            4,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "INVALID_REDEMPTION_AMOUNT")
        );
    }

    function testAblation_M4_I22() public {
        _assertAblation(
            _scenarioI22(),
            4,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "INSUFFICIENT_AVAILABLE_SHARES")
        );
    }

    function testAblation_M4_I23() public {
        _assertAblation(
            _scenarioI23(),
            4,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "INSUFFICIENT_AVAILABLE_SHARES")
        );
    }

    function testAblation_M4_I24() public {
        _assertAblation(
            _scenarioI24(),
            4,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "REDEMPTION_ALREADY_SETTLED")
        );
    }
}
