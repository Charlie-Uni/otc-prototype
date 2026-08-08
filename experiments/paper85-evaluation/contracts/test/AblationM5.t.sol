// SPDX-License-Identifier: MIT
// Generated from scenarios.v1.json; do not edit by hand.
// Manifest-SHA256: 97eabdaab3de5cc4d3cb41bbce1b82e445edfa7c8ea060618dc7b51fa5be4c69
pragma solidity ^0.8.30;

import {AblationDifferentialHarness} from "./AblationDifferentialHarness.sol";

contract AblationM5Test is AblationDifferentialHarness {
    function testAblation_M5_V01() public {
        _assertAblation(_scenarioV01(), 5, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M5_V02() public {
        _assertAblation(_scenarioV02(), 5, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M5_V03() public {
        _assertAblation(_scenarioV03(), 5, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M5_V04() public {
        _assertAblation(_scenarioV04(), 5, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M5_V05() public {
        _assertAblation(_scenarioV05(), 5, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M5_V06() public {
        _assertAblation(_scenarioV06(), 5, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M5_V07() public {
        _assertAblation(_scenarioV07(), 5, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M5_V08() public {
        _assertAblation(_scenarioV08(), 5, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M5_V09() public {
        _assertAblation(_scenarioV09(), 5, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M5_V10() public {
        _assertAblation(_scenarioV10(), 5, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M5_V11() public {
        _assertAblation(_scenarioV11(), 5, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M5_V12() public {
        _assertAblation(_scenarioV12(), 5, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M5_V13() public {
        _assertAblation(_scenarioV13(), 5, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M5_V14() public {
        _assertAblation(_scenarioV14(), 5, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M5_V15() public {
        _assertAblation(_scenarioV15(), 5, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M5_V16() public {
        _assertAblation(_scenarioV16(), 5, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M5_V17() public {
        _assertAblation(_scenarioV17(), 5, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M5_V18() public {
        _assertAblation(_scenarioV18(), 5, false, ResultClass.ExpectedAccept, bytes(""));
    }

    function testAblation_M5_I01() public {
        _assertAblation(
            _scenarioI01(),
            5,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, DEFAULT_ADMIN_ROLE
            )
        );
    }

    function testAblation_M5_I02() public {
        _assertAblation(
            _scenarioI02(),
            5,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, MANAGER_ROLE
            )
        );
    }

    function testAblation_M5_I03() public {
        _assertAblation(
            _scenarioI03(),
            5,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, SUBSCRIPTION_ROLE
            )
        );
    }

    function testAblation_M5_I04() public {
        _assertAblation(
            _scenarioI04(),
            5,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, REDEMPTION_ROLE
            )
        );
    }

    function testAblation_M5_I05() public {
        _assertAblation(
            _scenarioI05(),
            5,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, DEFAULT_ADMIN_ROLE
            )
        );
    }

    function testAblation_M5_I06() public {
        _assertAblation(
            _scenarioI06(),
            5,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "NOT_WHITELISTED")
        );
    }

    function testAblation_M5_I07() public {
        _assertAblation(
            _scenarioI07(),
            5,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "NOT_WHITELISTED")
        );
    }

    function testAblation_M5_I08() public {
        _assertAblation(
            _scenarioI08(),
            5,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "RECEIVER_NOT_WHITELISTED")
        );
    }

    function testAblation_M5_I09() public {
        _assertAblation(
            _scenarioI09(),
            5,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "NOT_WHITELISTED")
        );
    }

    function testAblation_M5_I10() public {
        _assertAblation(
            _scenarioI10(), 5, false, ResultClass.ExpectedReject, abi.encodeWithSignature("Error(string)", "NO_NAV")
        );
    }

    function testAblation_M5_I11() public {
        _assertAblation(
            _scenarioI11(),
            5,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "NAV_NOT_INITIALIZED")
        );
    }

    function testAblation_M5_I12() public {
        _assertAblation(
            _scenarioI12(),
            5,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "NAV_ALREADY_INITIALIZED")
        );
    }

    function testAblation_M5_I13() public {
        _assertAblation(
            _scenarioI13(),
            5,
            false,
            ResultClass.ExpectedReject,
            abi.encodeWithSignature("Error(string)", "AS_OF_BEFORE_LATEST")
        );
    }

    function testAblation_M5_I14() public {
        _assertAblation(
            _scenarioI14(), 5, false, ResultClass.ExpectedReject, abi.encodeWithSignature("Error(string)", "PAUSED")
        );
    }

    function testAblation_M5_I15() public {
        _assertAblation(
            _scenarioI15(), 5, false, ResultClass.ExpectedReject, abi.encodeWithSignature("Error(string)", "PAUSED")
        );
    }

    function testAblation_M5_I16() public {
        _assertAblation(
            _scenarioI16(), 5, false, ResultClass.ExpectedReject, abi.encodeWithSignature("Error(string)", "PAUSED")
        );
    }

    function testAblation_M5_I17() public {
        _assertAblation(
            _scenarioI17(), 5, false, ResultClass.ExpectedReject, abi.encodeWithSignature("Error(string)", "PAUSED")
        );
    }

    function testAblation_M5_I18() public {
        _assertAblation(
            _scenarioI18(),
            5,
            true,
            ResultClass.InvalidTransitionAccepted,
            abi.encodeWithSignature("Error(string)", "INVALID_SUBSCRIPTION_AMOUNT")
        );
    }

    function testAblation_M5_I19() public {
        _assertAblation(
            _scenarioI19(),
            5,
            true,
            ResultClass.InvalidTransitionAccepted,
            abi.encodeWithSignature("Error(string)", "SUBSCRIPTION_TOO_SMALL")
        );
    }

    function testAblation_M5_I20() public {
        _assertAblation(
            _scenarioI20(),
            5,
            true,
            ResultClass.InvalidTransitionAccepted,
            abi.encodeWithSignature("Error(string)", "SUBSCRIPTION_ALREADY_ACCEPTED")
        );
    }

    function testAblation_M5_I21() public {
        _assertAblation(
            _scenarioI21(),
            5,
            true,
            ResultClass.InvalidTransitionAccepted,
            abi.encodeWithSignature("Error(string)", "INVALID_REDEMPTION_AMOUNT")
        );
    }

    function testAblation_M5_I22() public {
        _assertAblation(
            _scenarioI22(),
            5,
            true,
            ResultClass.InvalidTransitionAccepted,
            abi.encodeWithSignature("Error(string)", "INSUFFICIENT_AVAILABLE_SHARES")
        );
    }

    function testAblation_M5_I23() public {
        _assertAblation(
            _scenarioI23(),
            5,
            true,
            ResultClass.InvalidTransitionAccepted,
            abi.encodeWithSignature("Error(string)", "INSUFFICIENT_AVAILABLE_SHARES")
        );
    }

    function testAblation_M5_I24() public {
        _assertAblation(
            _scenarioI24(),
            5,
            true,
            ResultClass.RuntimeRevert,
            abi.encodeWithSelector(bytes4(keccak256("Panic(uint256)")), uint256(0x11))
        );
    }
}
