// SPDX-License-Identifier: MIT
// Generated from scenarios.v1.json; do not edit by hand.
// Manifest-SHA256: 97eabdaab3de5cc4d3cb41bbce1b82e445edfa7c8ea060618dc7b51fa5be4c69
pragma solidity ^0.8.30;

import {AblationDifferentialHarness} from "./AblationDifferentialHarness.sol";

contract AblationM1Test is AblationDifferentialHarness {
    function testAblation_M1_V01() public {
        _assertAblation(_scenarioV01(), 1, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M1_V02() public {
        _assertAblation(_scenarioV02(), 1, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M1_V03() public {
        _assertAblation(_scenarioV03(), 1, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M1_V04() public {
        _assertAblation(_scenarioV04(), 1, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M1_V05() public {
        _assertAblation(_scenarioV05(), 1, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M1_V06() public {
        _assertAblation(_scenarioV06(), 1, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M1_V07() public {
        _assertAblation(_scenarioV07(), 1, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M1_V08() public {
        _assertAblation(_scenarioV08(), 1, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M1_V09() public {
        _assertAblation(_scenarioV09(), 1, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M1_V10() public {
        _assertAblation(_scenarioV10(), 1, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M1_V11() public {
        _assertAblation(_scenarioV11(), 1, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M1_V12() public {
        _assertAblation(_scenarioV12(), 1, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M1_V13() public {
        _assertAblation(_scenarioV13(), 1, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M1_V14() public {
        _assertAblation(_scenarioV14(), 1, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M1_V15() public {
        _assertAblation(_scenarioV15(), 1, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M1_V16() public {
        _assertAblation(_scenarioV16(), 1, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M1_V17() public {
        _assertAblation(_scenarioV17(), 1, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M1_V18() public {
        _assertAblation(_scenarioV18(), 1, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M1_I01() public {
        _assertAblation(
            _scenarioI01(),
            1,
            true,
            ResultClass.InvalidTransitionAccepted,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, DEFAULT_ADMIN_ROLE
            )
        );
    }

    function testAblation_M1_I02() public {
        _assertAblation(
            _scenarioI02(),
            1,
            true,
            ResultClass.InvalidTransitionAccepted,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, MANAGER_ROLE
            )
        );
    }

    function testAblation_M1_I03() public {
        _assertAblation(
            _scenarioI03(),
            1,
            true,
            ResultClass.InvalidTransitionAccepted,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, SUBSCRIPTION_ROLE
            )
        );
    }

    function testAblation_M1_I04() public {
        _assertAblation(
            _scenarioI04(),
            1,
            true,
            ResultClass.InvalidTransitionAccepted,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, REDEMPTION_ROLE
            )
        );
    }

    function testAblation_M1_I05() public {
        _assertAblation(
            _scenarioI05(),
            1,
            true,
            ResultClass.InvalidTransitionAccepted,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, DEFAULT_ADMIN_ROLE
            )
        );
    }

    function testAblation_M1_I06() public {
        _assertAblation(
            _scenarioI06(),
            1,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "NOT_WHITELISTED")
        );
    }

    function testAblation_M1_I07() public {
        _assertAblation(
            _scenarioI07(),
            1,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "NOT_WHITELISTED")
        );
    }

    function testAblation_M1_I08() public {
        _assertAblation(
            _scenarioI08(),
            1,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "RECEIVER_NOT_WHITELISTED")
        );
    }

    function testAblation_M1_I09() public {
        _assertAblation(
            _scenarioI09(),
            1,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "NOT_WHITELISTED")
        );
    }

    function testAblation_M1_I10() public {
        _assertAblation(
            _scenarioI10(), 1, false, ResultClass.ExpectedReject, abi.encodeWithSignature("Error(string)", "NO_NAV")
        );
    }

    function testAblation_M1_I11() public {
        _assertAblation(
            _scenarioI11(),
            1,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "NAV_NOT_INITIALIZED")
        );
    }

    function testAblation_M1_I12() public {
        _assertAblation(
            _scenarioI12(),
            1,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "NAV_ALREADY_INITIALIZED")
        );
    }

    function testAblation_M1_I13() public {
        _assertAblation(
            _scenarioI13(),
            1,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "AS_OF_BEFORE_LATEST")
        );
    }

    function testAblation_M1_I14() public {
        _assertAblation(
            _scenarioI14(), 1, false, ResultClass.ExpectedReject, abi.encodeWithSignature("Error(string)", "PAUSED")
        );
    }

    function testAblation_M1_I15() public {
        _assertAblation(
            _scenarioI15(), 1, false, ResultClass.ExpectedReject, abi.encodeWithSignature("Error(string)", "PAUSED")
        );
    }

    function testAblation_M1_I16() public {
        _assertAblation(
            _scenarioI16(), 1, false, ResultClass.ExpectedReject, abi.encodeWithSignature("Error(string)", "PAUSED")
        );
    }

    function testAblation_M1_I17() public {
        _assertAblation(
            _scenarioI17(), 1, false, ResultClass.ExpectedReject, abi.encodeWithSignature("Error(string)", "PAUSED")
        );
    }

    function testAblation_M1_I18() public {
        _assertAblation(
            _scenarioI18(),
            1,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "INVALID_SUBSCRIPTION_AMOUNT")
        );
    }

    function testAblation_M1_I19() public {
        _assertAblation(
            _scenarioI19(),
            1,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "SUBSCRIPTION_TOO_SMALL")
        );
    }

    function testAblation_M1_I20() public {
        _assertAblation(
            _scenarioI20(),
            1,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "SUBSCRIPTION_ALREADY_ACCEPTED")
        );
    }

    function testAblation_M1_I21() public {
        _assertAblation(
            _scenarioI21(),
            1,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "INVALID_REDEMPTION_AMOUNT")
        );
    }

    function testAblation_M1_I22() public {
        _assertAblation(
            _scenarioI22(),
            1,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "INSUFFICIENT_AVAILABLE_SHARES")
        );
    }

    function testAblation_M1_I23() public {
        _assertAblation(
            _scenarioI23(),
            1,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "INSUFFICIENT_AVAILABLE_SHARES")
        );
    }

    function testAblation_M1_I24() public {
        _assertAblation(
            _scenarioI24(),
            1,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "REDEMPTION_ALREADY_SETTLED")
        );
    }
}
