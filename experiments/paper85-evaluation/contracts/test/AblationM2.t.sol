// SPDX-License-Identifier: MIT
// Generated from scenarios.v1.json; do not edit by hand.
// Manifest-SHA256: 97eabdaab3de5cc4d3cb41bbce1b82e445edfa7c8ea060618dc7b51fa5be4c69
pragma solidity ^0.8.30;

import {AblationDifferentialHarness} from "./AblationDifferentialHarness.sol";

contract AblationM2Test is AblationDifferentialHarness {
    function testAblation_M2_V01() public {
        _assertAblation(_scenarioV01(), 2, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M2_V02() public {
        _assertAblation(_scenarioV02(), 2, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M2_V03() public {
        _assertAblation(_scenarioV03(), 2, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M2_V04() public {
        _assertAblation(_scenarioV04(), 2, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M2_V05() public {
        _assertAblation(_scenarioV05(), 2, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M2_V06() public {
        _assertAblation(_scenarioV06(), 2, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M2_V07() public {
        _assertAblation(_scenarioV07(), 2, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M2_V08() public {
        _assertAblation(_scenarioV08(), 2, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M2_V09() public {
        _assertAblation(_scenarioV09(), 2, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M2_V10() public {
        _assertAblation(_scenarioV10(), 2, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M2_V11() public {
        _assertAblation(_scenarioV11(), 2, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M2_V12() public {
        _assertAblation(_scenarioV12(), 2, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M2_V13() public {
        _assertAblation(_scenarioV13(), 2, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M2_V14() public {
        _assertAblation(_scenarioV14(), 2, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M2_V15() public {
        _assertAblation(_scenarioV15(), 2, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M2_V16() public {
        _assertAblation(_scenarioV16(), 2, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M2_V17() public {
        _assertAblation(_scenarioV17(), 2, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M2_V18() public {
        _assertAblation(_scenarioV18(), 2, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M2_I01() public {
        _assertAblation(
            _scenarioI01(),
            2,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, DEFAULT_ADMIN_ROLE
            )
        );
    }

    function testAblation_M2_I02() public {
        _assertAblation(
            _scenarioI02(),
            2,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, MANAGER_ROLE
            )
        );
    }

    function testAblation_M2_I03() public {
        _assertAblation(
            _scenarioI03(),
            2,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, SUBSCRIPTION_ROLE
            )
        );
    }

    function testAblation_M2_I04() public {
        _assertAblation(
            _scenarioI04(),
            2,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, REDEMPTION_ROLE
            )
        );
    }

    function testAblation_M2_I05() public {
        _assertAblation(
            _scenarioI05(),
            2,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, DEFAULT_ADMIN_ROLE
            )
        );
    }

    function testAblation_M2_I06() public {
        _assertAblation(
            _scenarioI06(),
            2,
            true,
            ResultClass.InvalidTransitionAccepted,
            abi.encodeWithSignature("Error(string)", "NOT_WHITELISTED")
        );
    }

    function testAblation_M2_I07() public {
        _assertAblation(
            _scenarioI07(),
            2,
            true,
            ResultClass.InvalidTransitionAccepted,
            abi.encodeWithSignature("Error(string)", "NOT_WHITELISTED")
        );
    }

    function testAblation_M2_I08() public {
        _assertAblation(
            _scenarioI08(),
            2,
            true,
            ResultClass.InvalidTransitionAccepted,
            abi.encodeWithSignature("Error(string)", "RECEIVER_NOT_WHITELISTED")
        );
    }

    function testAblation_M2_I09() public {
        _assertAblation(
            _scenarioI09(),
            2,
            true,
            ResultClass.InvalidTransitionAccepted,
            abi.encodeWithSignature("Error(string)", "NOT_WHITELISTED")
        );
    }

    function testAblation_M2_I10() public {
        _assertAblation(
            _scenarioI10(), 2, false, ResultClass.ExpectedReject, abi.encodeWithSignature("Error(string)", "NO_NAV")
        );
    }

    function testAblation_M2_I11() public {
        _assertAblation(
            _scenarioI11(),
            2,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "NAV_NOT_INITIALIZED")
        );
    }

    function testAblation_M2_I12() public {
        _assertAblation(
            _scenarioI12(),
            2,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "NAV_ALREADY_INITIALIZED")
        );
    }

    function testAblation_M2_I13() public {
        _assertAblation(
            _scenarioI13(),
            2,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "AS_OF_BEFORE_LATEST")
        );
    }

    function testAblation_M2_I14() public {
        _assertAblation(
            _scenarioI14(), 2, false, ResultClass.ExpectedReject, abi.encodeWithSignature("Error(string)", "PAUSED")
        );
    }

    function testAblation_M2_I15() public {
        _assertAblation(
            _scenarioI15(), 2, false, ResultClass.ExpectedReject, abi.encodeWithSignature("Error(string)", "PAUSED")
        );
    }

    function testAblation_M2_I16() public {
        _assertAblation(
            _scenarioI16(), 2, false, ResultClass.ExpectedReject, abi.encodeWithSignature("Error(string)", "PAUSED")
        );
    }

    function testAblation_M2_I17() public {
        _assertAblation(
            _scenarioI17(), 2, false, ResultClass.ExpectedReject, abi.encodeWithSignature("Error(string)", "PAUSED")
        );
    }

    function testAblation_M2_I18() public {
        _assertAblation(
            _scenarioI18(),
            2,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "INVALID_SUBSCRIPTION_AMOUNT")
        );
    }

    function testAblation_M2_I19() public {
        _assertAblation(
            _scenarioI19(),
            2,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "SUBSCRIPTION_TOO_SMALL")
        );
    }

    function testAblation_M2_I20() public {
        _assertAblation(
            _scenarioI20(),
            2,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "SUBSCRIPTION_ALREADY_ACCEPTED")
        );
    }

    function testAblation_M2_I21() public {
        _assertAblation(
            _scenarioI21(),
            2,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "INVALID_REDEMPTION_AMOUNT")
        );
    }

    function testAblation_M2_I22() public {
        _assertAblation(
            _scenarioI22(),
            2,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "INSUFFICIENT_AVAILABLE_SHARES")
        );
    }

    function testAblation_M2_I23() public {
        _assertAblation(
            _scenarioI23(),
            2,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "INSUFFICIENT_AVAILABLE_SHARES")
        );
    }

    function testAblation_M2_I24() public {
        _assertAblation(
            _scenarioI24(),
            2,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "REDEMPTION_ALREADY_SETTLED")
        );
    }
}
