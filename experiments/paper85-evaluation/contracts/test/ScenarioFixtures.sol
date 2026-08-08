// SPDX-License-Identifier: MIT
// Generated from scenarios.v1.json; do not edit by hand.
// Manifest-SHA256: 97eabdaab3de5cc4d3cb41bbce1b82e445edfa7c8ea060618dc7b51fa5be4c69
pragma solidity ^0.8.30;

import {M0DifferentialHarness} from "./M0DifferentialHarness.sol";

abstract contract ScenarioFixtures is M0DifferentialHarness {
    function _applyFixture(uint8 fixtureId) internal override {
        if (fixtureId == 0) {
            return;
        } else if (fixtureId == 1) {
            _mustCallAt(
                60,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature(
                    "setWhitelisted(address,bool,bytes32)",
                    ALICE,
                    true,
                    bytes32(0xc897dd66b2857180257021de2aaf6472bcdd73e5578e5c31fd4637976913f459)
                )
            );
            return;
        } else if (fixtureId == 2) {
            _mustCallAt(
                60,
                Target.NAVRegistry,
                MANAGER,
                abi.encodeWithSignature(
                    "postInitialNAV(bytes32,uint256,uint64,bytes32)",
                    FUND_ID,
                    1000000000000000000,
                    uint64(GENESIS_TIMESTAMP + 60),
                    bytes32(0x670d332a72021c0917a475987dba74f620f9a814089ce41f31a1aff83586c391)
                )
            );
            return;
        } else if (fixtureId == 3) {
            _mustCallAt(
                60,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature(
                    "setWhitelisted(address,bool,bytes32)",
                    ALICE,
                    true,
                    bytes32(0xc897dd66b2857180257021de2aaf6472bcdd73e5578e5c31fd4637976913f459)
                )
            );
            _mustCallAt(
                90,
                Target.NAVRegistry,
                MANAGER,
                abi.encodeWithSignature(
                    "postInitialNAV(bytes32,uint256,uint64,bytes32)",
                    FUND_ID,
                    1000000000000000000,
                    uint64(GENESIS_TIMESTAMP + 90),
                    bytes32(0x670d332a72021c0917a475987dba74f620f9a814089ce41f31a1aff83586c391)
                )
            );
            return;
        } else if (fixtureId == 4) {
            _mustCallAt(
                60,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature(
                    "setWhitelisted(address,bool,bytes32)",
                    ALICE,
                    true,
                    bytes32(0xc897dd66b2857180257021de2aaf6472bcdd73e5578e5c31fd4637976913f459)
                )
            );
            _mustCallAt(
                90,
                Target.NAVRegistry,
                MANAGER,
                abi.encodeWithSignature(
                    "postInitialNAV(bytes32,uint256,uint64,bytes32)",
                    FUND_ID,
                    1000000000000000000,
                    uint64(GENESIS_TIMESTAMP + 90),
                    bytes32(0x670d332a72021c0917a475987dba74f620f9a814089ce41f31a1aff83586c391)
                )
            );
            _mustCallAt(
                120,
                Target.FundToken,
                ALICE,
                abi.encodeWithSignature("requestSubscription(uint256)", 100000000000000000000)
            );
            return;
        } else if (fixtureId == 5) {
            _mustCallAt(
                60,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature(
                    "setWhitelisted(address,bool,bytes32)",
                    ALICE,
                    true,
                    bytes32(0xc897dd66b2857180257021de2aaf6472bcdd73e5578e5c31fd4637976913f459)
                )
            );
            _mustCallAt(
                120,
                Target.FundToken,
                ALICE,
                abi.encodeWithSignature("requestSubscription(uint256)", 100000000000000000000)
            );
            return;
        } else if (fixtureId == 6) {
            _mustCallAt(
                60,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature(
                    "setWhitelisted(address,bool,bytes32)",
                    ALICE,
                    true,
                    bytes32(0xc897dd66b2857180257021de2aaf6472bcdd73e5578e5c31fd4637976913f459)
                )
            );
            _mustCallAt(
                90,
                Target.NAVRegistry,
                MANAGER,
                abi.encodeWithSignature(
                    "postInitialNAV(bytes32,uint256,uint64,bytes32)",
                    FUND_ID,
                    1000000000000000000000000000000,
                    uint64(GENESIS_TIMESTAMP + 90),
                    bytes32(0x670d332a72021c0917a475987dba74f620f9a814089ce41f31a1aff83586c391)
                )
            );
            _mustCallAt(120, Target.FundToken, ALICE, abi.encodeWithSignature("requestSubscription(uint256)", 1));
            return;
        } else if (fixtureId == 7) {
            _mustCallAt(
                60,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature(
                    "setWhitelisted(address,bool,bytes32)",
                    ALICE,
                    true,
                    bytes32(0xc897dd66b2857180257021de2aaf6472bcdd73e5578e5c31fd4637976913f459)
                )
            );
            _mustCallAt(
                90,
                Target.NAVRegistry,
                MANAGER,
                abi.encodeWithSignature(
                    "postInitialNAV(bytes32,uint256,uint64,bytes32)",
                    FUND_ID,
                    1000000000000000000,
                    uint64(GENESIS_TIMESTAMP + 90),
                    bytes32(0x670d332a72021c0917a475987dba74f620f9a814089ce41f31a1aff83586c391)
                )
            );
            _mustCallAt(
                120,
                Target.FundToken,
                ALICE,
                abi.encodeWithSignature("requestSubscription(uint256)", 100000000000000000000)
            );
            _mustCallAt(
                150, Target.FundToken, SUBSCRIPTION_OPERATOR, abi.encodeWithSignature("acceptSubscription(uint256)", 0)
            );
            return;
        } else if (fixtureId == 8) {
            _mustCallAt(
                60,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature(
                    "setWhitelisted(address,bool,bytes32)",
                    ALICE,
                    true,
                    bytes32(0xc897dd66b2857180257021de2aaf6472bcdd73e5578e5c31fd4637976913f459)
                )
            );
            _mustCallAt(
                90,
                Target.NAVRegistry,
                MANAGER,
                abi.encodeWithSignature(
                    "postInitialNAV(bytes32,uint256,uint64,bytes32)",
                    FUND_ID,
                    1000000000000000000,
                    uint64(GENESIS_TIMESTAMP + 90),
                    bytes32(0x670d332a72021c0917a475987dba74f620f9a814089ce41f31a1aff83586c391)
                )
            );
            _mustCallAt(
                120,
                Target.FundToken,
                ALICE,
                abi.encodeWithSignature("requestSubscription(uint256)", 100000000000000000000)
            );
            _mustCallAt(
                150, Target.FundToken, SUBSCRIPTION_OPERATOR, abi.encodeWithSignature("acceptSubscription(uint256)", 0)
            );
            _mustCallAt(
                180,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature(
                    "setWhitelisted(address,bool,bytes32)",
                    BOB,
                    true,
                    bytes32(0x6550237a180b992bad948e5e78f2df12f753532d9b116919c1db3762ce25e03c)
                )
            );
            _mustCallAt(
                210,
                Target.FundToken,
                ALICE,
                abi.encodeWithSignature("transfer(address,uint256)", BOB, 20000000000000000000)
            );
            return;
        } else if (fixtureId == 9) {
            _mustCallAt(
                60,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature(
                    "setWhitelisted(address,bool,bytes32)",
                    ALICE,
                    true,
                    bytes32(0xc897dd66b2857180257021de2aaf6472bcdd73e5578e5c31fd4637976913f459)
                )
            );
            _mustCallAt(
                90,
                Target.NAVRegistry,
                MANAGER,
                abi.encodeWithSignature(
                    "postInitialNAV(bytes32,uint256,uint64,bytes32)",
                    FUND_ID,
                    1000000000000000000,
                    uint64(GENESIS_TIMESTAMP + 90),
                    bytes32(0x670d332a72021c0917a475987dba74f620f9a814089ce41f31a1aff83586c391)
                )
            );
            _mustCallAt(
                120,
                Target.FundToken,
                ALICE,
                abi.encodeWithSignature("requestSubscription(uint256)", 100000000000000000000)
            );
            _mustCallAt(
                150, Target.FundToken, SUBSCRIPTION_OPERATOR, abi.encodeWithSignature("acceptSubscription(uint256)", 0)
            );
            _mustCallAt(
                180,
                Target.FundToken,
                ALICE,
                abi.encodeWithSignature("requestRedemption(uint256)", 20000000000000000000)
            );
            return;
        } else if (fixtureId == 10) {
            _mustCallAt(
                60,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature(
                    "setWhitelisted(address,bool,bytes32)",
                    ALICE,
                    true,
                    bytes32(0xc897dd66b2857180257021de2aaf6472bcdd73e5578e5c31fd4637976913f459)
                )
            );
            _mustCallAt(
                90,
                Target.NAVRegistry,
                MANAGER,
                abi.encodeWithSignature(
                    "postInitialNAV(bytes32,uint256,uint64,bytes32)",
                    FUND_ID,
                    1000000000000000000,
                    uint64(GENESIS_TIMESTAMP + 90),
                    bytes32(0x670d332a72021c0917a475987dba74f620f9a814089ce41f31a1aff83586c391)
                )
            );
            _mustCallAt(
                120,
                Target.FundToken,
                ALICE,
                abi.encodeWithSignature("requestSubscription(uint256)", 100000000000000000000)
            );
            _mustCallAt(
                150, Target.FundToken, SUBSCRIPTION_OPERATOR, abi.encodeWithSignature("acceptSubscription(uint256)", 0)
            );
            _mustCallAt(
                180,
                Target.FundToken,
                ALICE,
                abi.encodeWithSignature("requestRedemption(uint256)", 20000000000000000000)
            );
            _mustCallAt(
                210, Target.FundToken, REDEMPTION_OPERATOR, abi.encodeWithSignature("settleRedemption(uint256)", 0)
            );
            return;
        } else if (fixtureId == 11) {
            _mustCallAt(
                60,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature(
                    "setWhitelisted(address,bool,bytes32)",
                    ALICE,
                    true,
                    bytes32(0xc897dd66b2857180257021de2aaf6472bcdd73e5578e5c31fd4637976913f459)
                )
            );
            _mustCallAt(
                90,
                Target.NAVRegistry,
                MANAGER,
                abi.encodeWithSignature(
                    "postInitialNAV(bytes32,uint256,uint64,bytes32)",
                    FUND_ID,
                    1000000000000000000,
                    uint64(GENESIS_TIMESTAMP + 90),
                    bytes32(0x670d332a72021c0917a475987dba74f620f9a814089ce41f31a1aff83586c391)
                )
            );
            _mustCallAt(
                120,
                Target.FundToken,
                ALICE,
                abi.encodeWithSignature("requestSubscription(uint256)", 100000000000000000000)
            );
            _mustCallAt(
                150, Target.FundToken, SUBSCRIPTION_OPERATOR, abi.encodeWithSignature("acceptSubscription(uint256)", 0)
            );
            _mustCallAt(
                170,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature(
                    "setWhitelisted(address,bool,bytes32)",
                    BOB,
                    true,
                    bytes32(0x6550237a180b992bad948e5e78f2df12f753532d9b116919c1db3762ce25e03c)
                )
            );
            _mustCallAt(
                180,
                Target.FundToken,
                ALICE,
                abi.encodeWithSignature("requestRedemption(uint256)", 80000000000000000000)
            );
            return;
        } else if (fixtureId == 12) {
            _mustCallAt(
                60,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature(
                    "setWhitelisted(address,bool,bytes32)",
                    ALICE,
                    true,
                    bytes32(0xc897dd66b2857180257021de2aaf6472bcdd73e5578e5c31fd4637976913f459)
                )
            );
            _mustCallAt(
                90,
                Target.NAVRegistry,
                MANAGER,
                abi.encodeWithSignature(
                    "postInitialNAV(bytes32,uint256,uint64,bytes32)",
                    FUND_ID,
                    1000000000000000000,
                    uint64(GENESIS_TIMESTAMP + 90),
                    bytes32(0x670d332a72021c0917a475987dba74f620f9a814089ce41f31a1aff83586c391)
                )
            );
            _mustCallAt(
                120,
                Target.FundToken,
                ALICE,
                abi.encodeWithSignature("requestSubscription(uint256)", 100000000000000000000)
            );
            _mustCallAt(
                150, Target.FundToken, SUBSCRIPTION_OPERATOR, abi.encodeWithSignature("acceptSubscription(uint256)", 0)
            );
            _mustCallAt(
                180,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature(
                    "setWhitelisted(address,bool,bytes32)",
                    ALICE,
                    false,
                    bytes32(0xc897dd66b2857180257021de2aaf6472bcdd73e5578e5c31fd4637976913f459)
                )
            );
            return;
        } else if (fixtureId == 13) {
            _mustCallAt(
                60,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature(
                    "setWhitelisted(address,bool,bytes32)",
                    ALICE,
                    true,
                    bytes32(0xc897dd66b2857180257021de2aaf6472bcdd73e5578e5c31fd4637976913f459)
                )
            );
            _mustCallAt(
                90,
                Target.NAVRegistry,
                MANAGER,
                abi.encodeWithSignature(
                    "postInitialNAV(bytes32,uint256,uint64,bytes32)",
                    FUND_ID,
                    1000000000000000000,
                    uint64(GENESIS_TIMESTAMP + 90),
                    bytes32(0x670d332a72021c0917a475987dba74f620f9a814089ce41f31a1aff83586c391)
                )
            );
            _mustCallAt(
                120,
                Target.FundToken,
                ALICE,
                abi.encodeWithSignature("requestSubscription(uint256)", 100000000000000000000)
            );
            _mustCallAt(
                150,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature(
                    "setWhitelisted(address,bool,bytes32)",
                    ALICE,
                    false,
                    bytes32(0xc897dd66b2857180257021de2aaf6472bcdd73e5578e5c31fd4637976913f459)
                )
            );
            return;
        } else if (fixtureId == 14) {
            _mustCallAt(
                60,
                Target.NAVRegistry,
                MANAGER,
                abi.encodeWithSignature(
                    "postInitialNAV(bytes32,uint256,uint64,bytes32)",
                    FUND_ID,
                    1000000000000000000,
                    uint64(GENESIS_TIMESTAMP + 60),
                    bytes32(0x670d332a72021c0917a475987dba74f620f9a814089ce41f31a1aff83586c391)
                )
            );
            _mustCallAt(
                90,
                Target.NAVRegistry,
                MANAGER,
                abi.encodeWithSignature(
                    "postNAV(bytes32,uint256,uint256,uint64,bytes32)",
                    FUND_ID,
                    110000000000000000000,
                    100000000000000000000,
                    uint64(GENESIS_TIMESTAMP + 80),
                    bytes32(0x1ebf10ade294d208b34aa27aeaed35ce15f9f78c713b444d16a4da8a53a3e6c5)
                )
            );
            _mustCallAt(
                120,
                Target.NAVRegistry,
                MANAGER,
                abi.encodeWithSignature(
                    "postNAV(bytes32,uint256,uint256,uint64,bytes32)",
                    FUND_ID,
                    120000000000000000000,
                    100000000000000000000,
                    uint64(GENESIS_TIMESTAMP + 110),
                    bytes32(0xbfdc730c777183bd7f7acc7ef2771bccf42e7ddbd0a52965f11d5cfc3e991c59)
                )
            );
            return;
        } else if (fixtureId == 15) {
            _mustCallAt(
                60,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature(
                    "setWhitelisted(address,bool,bytes32)",
                    ALICE,
                    true,
                    bytes32(0xc897dd66b2857180257021de2aaf6472bcdd73e5578e5c31fd4637976913f459)
                )
            );
            _mustCallAt(
                90,
                Target.NAVRegistry,
                MANAGER,
                abi.encodeWithSignature(
                    "postInitialNAV(bytes32,uint256,uint64,bytes32)",
                    FUND_ID,
                    1000000000000000000,
                    uint64(GENESIS_TIMESTAMP + 90),
                    bytes32(0x670d332a72021c0917a475987dba74f620f9a814089ce41f31a1aff83586c391)
                )
            );
            _mustCallAt(
                120,
                Target.FundToken,
                ALICE,
                abi.encodeWithSignature("requestSubscription(uint256)", 100000000000000000000)
            );
            _mustCallAt(
                150, Target.FundToken, SUBSCRIPTION_OPERATOR, abi.encodeWithSignature("acceptSubscription(uint256)", 0)
            );
            _mustCallAt(
                180,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature(
                    "setWhitelisted(address,bool,bytes32)",
                    BOB,
                    true,
                    bytes32(0x6550237a180b992bad948e5e78f2df12f753532d9b116919c1db3762ce25e03c)
                )
            );
            _mustCallAt(
                210,
                Target.FundToken,
                ALICE,
                abi.encodeWithSignature("transfer(address,uint256)", BOB, 20000000000000000000)
            );
            _mustCallAt(240, Target.FundToken, PAUSER, abi.encodeWithSignature("pause()"));
            return;
        } else if (fixtureId == 16) {
            _mustCallAt(
                60,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature(
                    "setWhitelisted(address,bool,bytes32)",
                    ALICE,
                    true,
                    bytes32(0xc897dd66b2857180257021de2aaf6472bcdd73e5578e5c31fd4637976913f459)
                )
            );
            _mustCallAt(
                90,
                Target.NAVRegistry,
                MANAGER,
                abi.encodeWithSignature(
                    "postInitialNAV(bytes32,uint256,uint64,bytes32)",
                    FUND_ID,
                    1000000000000000000,
                    uint64(GENESIS_TIMESTAMP + 90),
                    bytes32(0x670d332a72021c0917a475987dba74f620f9a814089ce41f31a1aff83586c391)
                )
            );
            _mustCallAt(
                120,
                Target.FundToken,
                ALICE,
                abi.encodeWithSignature("requestSubscription(uint256)", 100000000000000000000)
            );
            _mustCallAt(150, Target.FundToken, PAUSER, abi.encodeWithSignature("pause()"));
            return;
        } else if (fixtureId == 17) {
            _mustCallAt(
                60,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature(
                    "setWhitelisted(address,bool,bytes32)",
                    ALICE,
                    true,
                    bytes32(0xc897dd66b2857180257021de2aaf6472bcdd73e5578e5c31fd4637976913f459)
                )
            );
            _mustCallAt(
                90,
                Target.NAVRegistry,
                MANAGER,
                abi.encodeWithSignature(
                    "postInitialNAV(bytes32,uint256,uint64,bytes32)",
                    FUND_ID,
                    1000000000000000000,
                    uint64(GENESIS_TIMESTAMP + 90),
                    bytes32(0x670d332a72021c0917a475987dba74f620f9a814089ce41f31a1aff83586c391)
                )
            );
            _mustCallAt(
                120,
                Target.FundToken,
                ALICE,
                abi.encodeWithSignature("requestSubscription(uint256)", 100000000000000000000)
            );
            _mustCallAt(
                150, Target.FundToken, SUBSCRIPTION_OPERATOR, abi.encodeWithSignature("acceptSubscription(uint256)", 0)
            );
            _mustCallAt(
                180,
                Target.FundToken,
                ALICE,
                abi.encodeWithSignature("requestRedemption(uint256)", 20000000000000000000)
            );
            _mustCallAt(210, Target.FundToken, PAUSER, abi.encodeWithSignature("pause()"));
            return;
        } else if (fixtureId == 18) {
            _mustCallAt(
                60,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature(
                    "setWhitelisted(address,bool,bytes32)",
                    ALICE,
                    true,
                    bytes32(0xc897dd66b2857180257021de2aaf6472bcdd73e5578e5c31fd4637976913f459)
                )
            );
            _mustCallAt(
                90,
                Target.NAVRegistry,
                MANAGER,
                abi.encodeWithSignature(
                    "postInitialNAV(bytes32,uint256,uint64,bytes32)",
                    FUND_ID,
                    1000000000000000000,
                    uint64(GENESIS_TIMESTAMP + 90),
                    bytes32(0x670d332a72021c0917a475987dba74f620f9a814089ce41f31a1aff83586c391)
                )
            );
            _mustCallAt(
                120,
                Target.FundToken,
                ALICE,
                abi.encodeWithSignature("requestSubscription(uint256)", 100000000000000000000)
            );
            _mustCallAt(
                150, Target.FundToken, SUBSCRIPTION_OPERATOR, abi.encodeWithSignature("acceptSubscription(uint256)", 0)
            );
            _mustCallAt(
                180,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature(
                    "setWhitelisted(address,bool,bytes32)",
                    BOB,
                    true,
                    bytes32(0x6550237a180b992bad948e5e78f2df12f753532d9b116919c1db3762ce25e03c)
                )
            );
            _mustCallAt(
                210,
                Target.FundToken,
                ALICE,
                abi.encodeWithSignature("transfer(address,uint256)", BOB, 20000000000000000000)
            );
            _mustCallAt(
                230,
                Target.FundToken,
                ALICE,
                abi.encodeWithSignature("approve(address,uint256)", TRANSFER_OPERATOR, 10000000000000000000)
            );
            _mustCallAt(240, Target.FundToken, PAUSER, abi.encodeWithSignature("pause()"));
            return;
        } else if (fixtureId == 19) {
            _mustCallAt(
                120,
                Target.FundToken,
                ADMIN,
                abi.encodeWithSignature("grantRole(bytes32,address)", SUBSCRIPTION_ROLE, OPERATOR_2)
            );
            return;
        }
        revert("UNKNOWN_FIXTURE");
    }

    function _scenarioV01() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("V01"),
            fixtureId: 0,
            target: Target.FundToken,
            caller: ADMIN,
            actionData: abi.encodeWithSignature(
                "setWhitelisted(address,bool,bytes32)",
                ALICE,
                true,
                bytes32(0xc897dd66b2857180257021de2aaf6472bcdd73e5578e5c31fd4637976913f459)
            ),
            actionAtSec: 600,
            shouldAccept: true,
            expectedRevert: bytes("")
        });
    }

    function _scenarioV02() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("V02"),
            fixtureId: 1,
            target: Target.FundToken,
            caller: ADMIN,
            actionData: abi.encodeWithSignature(
                "setWhitelisted(address,bool,bytes32)",
                ALICE,
                false,
                bytes32(0xc897dd66b2857180257021de2aaf6472bcdd73e5578e5c31fd4637976913f459)
            ),
            actionAtSec: 600,
            shouldAccept: true,
            expectedRevert: bytes("")
        });
    }

    function _scenarioV03() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("V03"),
            fixtureId: 0,
            target: Target.NAVRegistry,
            caller: MANAGER,
            actionData: abi.encodeWithSignature(
                "postInitialNAV(bytes32,uint256,uint64,bytes32)",
                FUND_ID,
                1000000000000000000,
                uint64(GENESIS_TIMESTAMP + 590),
                bytes32(0x670d332a72021c0917a475987dba74f620f9a814089ce41f31a1aff83586c391)
            ),
            actionAtSec: 600,
            shouldAccept: true,
            expectedRevert: bytes("")
        });
    }

    function _scenarioV04() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("V04"),
            fixtureId: 2,
            target: Target.NAVRegistry,
            caller: MANAGER,
            actionData: abi.encodeWithSignature(
                "postNAV(bytes32,uint256,uint256,uint64,bytes32)",
                FUND_ID,
                110000000000000000000,
                100000000000000000000,
                uint64(GENESIS_TIMESTAMP + 590),
                bytes32(0x1ebf10ade294d208b34aa27aeaed35ce15f9f78c713b444d16a4da8a53a3e6c5)
            ),
            actionAtSec: 600,
            shouldAccept: true,
            expectedRevert: bytes("")
        });
    }

    function _scenarioV05() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("V05"),
            fixtureId: 14,
            target: Target.NAVRegistry,
            caller: MANAGER,
            actionData: abi.encodeWithSignature(
                "postNAV(bytes32,uint256,uint256,uint64,bytes32)",
                FUND_ID,
                125000000000000000000,
                100000000000000000000,
                uint64(GENESIS_TIMESTAMP + 110),
                bytes32(0xf53bd5b40adf342a28ab5637eb25b9b6110dd01950d4a8d77f141b9ab12b81e7)
            ),
            actionAtSec: 600,
            shouldAccept: true,
            expectedRevert: bytes("")
        });
    }

    function _scenarioV06() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("V06"),
            fixtureId: 3,
            target: Target.FundToken,
            caller: ALICE,
            actionData: abi.encodeWithSignature("requestSubscription(uint256)", 100000000000000000000),
            actionAtSec: 600,
            shouldAccept: true,
            expectedRevert: bytes("")
        });
    }

    function _scenarioV07() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("V07"),
            fixtureId: 3,
            target: Target.FundToken,
            caller: SUBSCRIPTION_OPERATOR,
            actionData: abi.encodeWithSignature(
                "requestSubscriptionFor(address,uint256)", ALICE, 100000000000000000000
            ),
            actionAtSec: 600,
            shouldAccept: true,
            expectedRevert: bytes("")
        });
    }

    function _scenarioV08() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("V08"),
            fixtureId: 4,
            target: Target.FundToken,
            caller: SUBSCRIPTION_OPERATOR,
            actionData: abi.encodeWithSignature("acceptSubscription(uint256)", 0),
            actionAtSec: 600,
            shouldAccept: true,
            expectedRevert: bytes("")
        });
    }

    function _scenarioV09() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("V09"),
            fixtureId: 8,
            target: Target.FundToken,
            caller: BOB,
            actionData: abi.encodeWithSignature("transfer(address,uint256)", ALICE, 5000000000000000000),
            actionAtSec: 600,
            shouldAccept: true,
            expectedRevert: bytes("")
        });
    }

    function _scenarioV10() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("V10"),
            fixtureId: 7,
            target: Target.FundToken,
            caller: ALICE,
            actionData: abi.encodeWithSignature("requestRedemption(uint256)", 20000000000000000000),
            actionAtSec: 600,
            shouldAccept: true,
            expectedRevert: bytes("")
        });
    }

    function _scenarioV11() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("V11"),
            fixtureId: 7,
            target: Target.FundToken,
            caller: REDEMPTION_OPERATOR,
            actionData: abi.encodeWithSignature("requestRedemptionFor(address,uint256)", ALICE, 20000000000000000000),
            actionAtSec: 600,
            shouldAccept: true,
            expectedRevert: bytes("")
        });
    }

    function _scenarioV12() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("V12"),
            fixtureId: 9,
            target: Target.FundToken,
            caller: REDEMPTION_OPERATOR,
            actionData: abi.encodeWithSignature(
                "flagSettlementDelayed(uint256,bytes32)",
                0,
                bytes32(0x1beec4ba77a4f1ad613270c28775038bc14cad9bc2228ceb0f4dbc12f3ce0e4b)
            ),
            actionAtSec: 600,
            shouldAccept: true,
            expectedRevert: bytes("")
        });
    }

    function _scenarioV13() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("V13"),
            fixtureId: 9,
            target: Target.FundToken,
            caller: REDEMPTION_OPERATOR,
            actionData: abi.encodeWithSignature("settleRedemption(uint256)", 0),
            actionAtSec: 600,
            shouldAccept: true,
            expectedRevert: bytes("")
        });
    }

    function _scenarioV14() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("V14"),
            fixtureId: 0,
            target: Target.FundToken,
            caller: PAUSER,
            actionData: abi.encodeWithSignature("pause()"),
            actionAtSec: 600,
            shouldAccept: true,
            expectedRevert: bytes("")
        });
    }

    function _scenarioV15() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("V15"),
            fixtureId: 15,
            target: Target.FundToken,
            caller: PAUSER,
            actionData: abi.encodeWithSignature("unpause()"),
            actionAtSec: 600,
            shouldAccept: true,
            expectedRevert: bytes("")
        });
    }

    function _scenarioV16() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("V16"),
            fixtureId: 0,
            target: Target.FundToken,
            caller: ADMIN,
            actionData: abi.encodeWithSignature("grantRole(bytes32,address)", SUBSCRIPTION_ROLE, OPERATOR_2),
            actionAtSec: 600,
            shouldAccept: true,
            expectedRevert: bytes("")
        });
    }

    function _scenarioV17() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("V17"),
            fixtureId: 19,
            target: Target.FundToken,
            caller: ADMIN,
            actionData: abi.encodeWithSignature("revokeRole(bytes32,address)", SUBSCRIPTION_ROLE, OPERATOR_2),
            actionAtSec: 600,
            shouldAccept: true,
            expectedRevert: bytes("")
        });
    }

    function _scenarioV18() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("V18"),
            fixtureId: 15,
            target: Target.FundToken,
            caller: ALICE,
            actionData: abi.encodeWithSignature("requestSubscription(uint256)", 100000000000000000000),
            actionAtSec: 600,
            shouldAccept: true,
            expectedRevert: bytes("")
        });
    }

    function _scenarioI01() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I01"),
            fixtureId: 0,
            target: Target.FundToken,
            caller: STRANGER,
            actionData: abi.encodeWithSignature(
                "setWhitelisted(address,bool,bytes32)",
                ALICE,
                true,
                bytes32(0xc897dd66b2857180257021de2aaf6472bcdd73e5578e5c31fd4637976913f459)
            ),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, DEFAULT_ADMIN_ROLE
            )
        });
    }

    function _scenarioI02() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I02"),
            fixtureId: 0,
            target: Target.NAVRegistry,
            caller: STRANGER,
            actionData: abi.encodeWithSignature(
                "postInitialNAV(bytes32,uint256,uint64,bytes32)",
                FUND_ID,
                1000000000000000000,
                uint64(GENESIS_TIMESTAMP + 590),
                bytes32(0x670d332a72021c0917a475987dba74f620f9a814089ce41f31a1aff83586c391)
            ),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, MANAGER_ROLE
            )
        });
    }

    function _scenarioI03() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I03"),
            fixtureId: 4,
            target: Target.FundToken,
            caller: STRANGER,
            actionData: abi.encodeWithSignature("acceptSubscription(uint256)", 0),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, SUBSCRIPTION_ROLE
            )
        });
    }

    function _scenarioI04() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I04"),
            fixtureId: 9,
            target: Target.FundToken,
            caller: STRANGER,
            actionData: abi.encodeWithSignature("settleRedemption(uint256)", 0),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, REDEMPTION_ROLE
            )
        });
    }

    function _scenarioI05() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I05"),
            fixtureId: 0,
            target: Target.FundToken,
            caller: STRANGER,
            actionData: abi.encodeWithSignature("grantRole(bytes32,address)", SUBSCRIPTION_ROLE, OPERATOR_2),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSelector(
                bytes4(keccak256("AccessControlUnauthorizedAccount(address,bytes32)")), STRANGER, DEFAULT_ADMIN_ROLE
            )
        });
    }

    function _scenarioI06() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I06"),
            fixtureId: 2,
            target: Target.FundToken,
            caller: ALICE,
            actionData: abi.encodeWithSignature("requestSubscription(uint256)", 100000000000000000000),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSignature("Error(string)", "NOT_WHITELISTED")
        });
    }

    function _scenarioI07() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I07"),
            fixtureId: 13,
            target: Target.FundToken,
            caller: SUBSCRIPTION_OPERATOR,
            actionData: abi.encodeWithSignature("acceptSubscription(uint256)", 0),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSignature("Error(string)", "NOT_WHITELISTED")
        });
    }

    function _scenarioI08() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I08"),
            fixtureId: 7,
            target: Target.FundToken,
            caller: ALICE,
            actionData: abi.encodeWithSignature("transfer(address,uint256)", BOB, 20000000000000000000),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSignature("Error(string)", "RECEIVER_NOT_WHITELISTED")
        });
    }

    function _scenarioI09() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I09"),
            fixtureId: 12,
            target: Target.FundToken,
            caller: ALICE,
            actionData: abi.encodeWithSignature("requestRedemption(uint256)", 20000000000000000000),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSignature("Error(string)", "NOT_WHITELISTED")
        });
    }

    function _scenarioI10() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I10"),
            fixtureId: 5,
            target: Target.FundToken,
            caller: SUBSCRIPTION_OPERATOR,
            actionData: abi.encodeWithSignature("acceptSubscription(uint256)", 0),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSignature("Error(string)", "NO_NAV")
        });
    }

    function _scenarioI11() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I11"),
            fixtureId: 0,
            target: Target.NAVRegistry,
            caller: MANAGER,
            actionData: abi.encodeWithSignature(
                "postNAV(bytes32,uint256,uint256,uint64,bytes32)",
                FUND_ID,
                100000000000000000000,
                100000000000000000000,
                uint64(GENESIS_TIMESTAMP + 590),
                bytes32(0x1ebf10ade294d208b34aa27aeaed35ce15f9f78c713b444d16a4da8a53a3e6c5)
            ),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSignature("Error(string)", "NAV_NOT_INITIALIZED")
        });
    }

    function _scenarioI12() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I12"),
            fixtureId: 2,
            target: Target.NAVRegistry,
            caller: MANAGER,
            actionData: abi.encodeWithSignature(
                "postInitialNAV(bytes32,uint256,uint64,bytes32)",
                FUND_ID,
                1000000000000000000,
                uint64(GENESIS_TIMESTAMP + 590),
                bytes32(0x670d332a72021c0917a475987dba74f620f9a814089ce41f31a1aff83586c391)
            ),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSignature("Error(string)", "NAV_ALREADY_INITIALIZED")
        });
    }

    function _scenarioI13() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I13"),
            fixtureId: 14,
            target: Target.NAVRegistry,
            caller: MANAGER,
            actionData: abi.encodeWithSignature(
                "postNAV(bytes32,uint256,uint256,uint64,bytes32)",
                FUND_ID,
                130000000000000000000,
                100000000000000000000,
                uint64(GENESIS_TIMESTAMP + 109),
                bytes32(0xf53bd5b40adf342a28ab5637eb25b9b6110dd01950d4a8d77f141b9ab12b81e7)
            ),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSignature("Error(string)", "AS_OF_BEFORE_LATEST")
        });
    }

    function _scenarioI14() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I14"),
            fixtureId: 15,
            target: Target.FundToken,
            caller: ALICE,
            actionData: abi.encodeWithSignature("transfer(address,uint256)", BOB, 5000000000000000000),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSignature("Error(string)", "PAUSED")
        });
    }

    function _scenarioI15() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I15"),
            fixtureId: 16,
            target: Target.FundToken,
            caller: SUBSCRIPTION_OPERATOR,
            actionData: abi.encodeWithSignature("acceptSubscription(uint256)", 0),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSignature("Error(string)", "PAUSED")
        });
    }

    function _scenarioI16() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I16"),
            fixtureId: 17,
            target: Target.FundToken,
            caller: REDEMPTION_OPERATOR,
            actionData: abi.encodeWithSignature("settleRedemption(uint256)", 0),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSignature("Error(string)", "PAUSED")
        });
    }

    function _scenarioI17() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I17"),
            fixtureId: 18,
            target: Target.FundToken,
            caller: TRANSFER_OPERATOR,
            actionData: abi.encodeWithSignature(
                "transferFrom(address,address,uint256)", ALICE, BOB, 5000000000000000000
            ),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSignature("Error(string)", "PAUSED")
        });
    }

    function _scenarioI18() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I18"),
            fixtureId: 3,
            target: Target.FundToken,
            caller: ALICE,
            actionData: abi.encodeWithSignature("requestSubscription(uint256)", 0),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSignature("Error(string)", "INVALID_SUBSCRIPTION_AMOUNT")
        });
    }

    function _scenarioI19() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I19"),
            fixtureId: 6,
            target: Target.FundToken,
            caller: SUBSCRIPTION_OPERATOR,
            actionData: abi.encodeWithSignature("acceptSubscription(uint256)", 0),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSignature("Error(string)", "SUBSCRIPTION_TOO_SMALL")
        });
    }

    function _scenarioI20() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I20"),
            fixtureId: 7,
            target: Target.FundToken,
            caller: SUBSCRIPTION_OPERATOR,
            actionData: abi.encodeWithSignature("acceptSubscription(uint256)", 0),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSignature("Error(string)", "SUBSCRIPTION_ALREADY_ACCEPTED")
        });
    }

    function _scenarioI21() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I21"),
            fixtureId: 7,
            target: Target.FundToken,
            caller: ALICE,
            actionData: abi.encodeWithSignature("requestRedemption(uint256)", 0),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSignature("Error(string)", "INVALID_REDEMPTION_AMOUNT")
        });
    }

    function _scenarioI22() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I22"),
            fixtureId: 7,
            target: Target.FundToken,
            caller: ALICE,
            actionData: abi.encodeWithSignature("requestRedemption(uint256)", 100000000000000000001),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSignature("Error(string)", "INSUFFICIENT_AVAILABLE_SHARES")
        });
    }

    function _scenarioI23() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I23"),
            fixtureId: 11,
            target: Target.FundToken,
            caller: ALICE,
            actionData: abi.encodeWithSignature("transfer(address,uint256)", BOB, 20000000000000000001),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSignature("Error(string)", "INSUFFICIENT_AVAILABLE_SHARES")
        });
    }

    function _scenarioI24() internal pure returns (Scenario memory) {
        return Scenario({
            id: bytes32("I24"),
            fixtureId: 10,
            target: Target.FundToken,
            caller: REDEMPTION_OPERATOR,
            actionData: abi.encodeWithSignature("settleRedemption(uint256)", 0),
            actionAtSec: 600,
            shouldAccept: false,
            expectedRevert: abi.encodeWithSignature("Error(string)", "REDEMPTION_ALREADY_SETTLED")
        });
    }
}
