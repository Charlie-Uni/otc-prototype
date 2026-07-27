// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {NAVRegistry} from "src/NAVRegistry.sol";

contract NAVRegistryTest is Test {
    NAVRegistry nav;
    address admin = address(0xA11CE);
    address stranger = address(0xBAD);
    bytes32 fundA = keccak256("OTC_FUND_1");
    bytes32 fundB = keccak256("OTC_FUND_2");
    bytes32 payloadA = keccak256("nav-a");
    bytes32 payloadB = keccak256("nav-b");

    event NAVUpdatedEvent(
        bytes32 indexed fundId,
        uint256 nav,
        uint64 asOf,
        uint64 storedAt,
        int256 navAdjustmentBps,
        bytes32 payloadHash,
        address indexed by
    );
    event ValuationHaircutEvent(
        bytes32 indexed fundId,
        uint16 valuationHaircutBps,
        uint64 occurredAt,
        uint64 submittedAt,
        bytes32 payloadHash,
        address indexed submittedBy
    );

    function setUp() public {
        vm.prank(admin);
        nav = new NAVRegistry(admin);
        vm.warp(1_710_000_000);
    }

    function testPostStoresFundScopedNAVAndCommitment() public {
        vm.expectEmit(true, true, false, true, address(nav));
        emit NAVUpdatedEvent(fundA, 123_456_789, 1_709_999_000, uint64(block.timestamp), 0, payloadA, admin);

        vm.prank(admin);
        nav.postNAV(fundA, 123_456_789, 1_709_999_000, payloadA);

        NAVRegistry.NavRecord memory record = nav.latestNAV(fundA);
        assertEq(record.nav, 123_456_789);
        assertEq(record.asOf, 1_709_999_000);
        assertEq(record.storedAt, block.timestamp);
        assertEq(record.navAdjustmentBps, 0);
        assertEq(record.payloadHash, payloadA);
        assertEq(nav.historyLength(fundA), 1);
        assertEq(nav.historyLength(fundB), 0);
    }

    function testNAVAdjustmentSupportsPositiveAndNegativeChanges() public {
        vm.startPrank(admin);
        nav.postNAV(fundA, 1_000_000, 1_709_999_000, payloadA);
        nav.postNAV(fundA, 1_100_000, 1_709_999_500, payloadB);
        nav.postNAV(fundA, 990_000, 1_709_999_800, keccak256("nav-c"));
        vm.stopPrank();

        assertEq(nav.navAt(fundA, 1).navAdjustmentBps, 1_000);
        assertEq(nav.navAt(fundA, 2).navAdjustmentBps, -1_000);
        assertEq(nav.historyLength(fundA), 3);
    }

    function testFundHistoriesAreIsolated() public {
        vm.startPrank(admin);
        nav.postNAV(fundA, 1_000_000, 1_709_999_000, payloadA);
        nav.postNAV(fundB, 2_000_000, 1_709_999_000, payloadB);
        vm.stopPrank();

        assertEq(nav.latestNAV(fundA).nav, 1_000_000);
        assertEq(nav.latestNAV(fundB).nav, 2_000_000);
        assertEq(nav.latestNAV(fundA).navAdjustmentBps, 0);
        assertEq(nav.latestNAV(fundB).navAdjustmentBps, 0);
    }

    function testValuationOracleStoresHaircutStateAndCommitment() public {
        uint64 occurredAt = uint64(block.timestamp);

        vm.expectEmit(true, true, false, true, address(nav));
        emit ValuationHaircutEvent(fundA, 1_250, occurredAt, occurredAt, payloadA, admin);
        vm.prank(admin);
        nav.postValuationHaircut(fundA, 1_250, occurredAt, payloadA);

        NAVRegistry.ValuationHaircutSnapshot memory snapshot = nav.latestValuationHaircut(fundA);
        assertEq(snapshot.valuationHaircutBps, 1_250);
        assertEq(snapshot.occurredAt, occurredAt);
        assertEq(snapshot.submittedAt, occurredAt);
        assertEq(snapshot.payloadHash, payloadA);
        assertEq(snapshot.submittedBy, admin);
        assertTrue(snapshot.exists);
    }

    function testValuationHaircutValidatesInputAndRole() public {
        vm.startPrank(admin);
        vm.expectRevert(bytes("BPS_OUT_OF_RANGE"));
        nav.postValuationHaircut(fundA, 10_001, uint64(block.timestamp), payloadA);
        vm.expectRevert(bytes("INVALID_PAYLOAD_HASH"));
        nav.postValuationHaircut(fundA, 1_000, uint64(block.timestamp), bytes32(0));
        vm.stopPrank();

        vm.prank(stranger);
        vm.expectRevert();
        nav.postValuationHaircut(fundA, 1_000, uint64(block.timestamp), payloadA);
    }

    function testPostRejectsInvalidState() public {
        vm.startPrank(admin);
        vm.expectRevert(bytes("INVALID_FUND_ID"));
        nav.postNAV(bytes32(0), 1, 1, payloadA);

        vm.expectRevert(bytes("INVALID_NAV"));
        nav.postNAV(fundA, 0, 1, payloadA);

        vm.expectRevert(bytes("INVALID_AS_OF"));
        nav.postNAV(fundA, 1, 0, payloadA);

        vm.expectRevert(bytes("FUTURE_AS_OF"));
        nav.postNAV(fundA, 1, uint64(block.timestamp + 1), payloadA);

        vm.expectRevert(bytes("INVALID_PAYLOAD_HASH"));
        nav.postNAV(fundA, 1, 1, bytes32(0));

        nav.postNAV(fundA, 1_000_000, 1_709_999_000, payloadA);
        vm.expectRevert(bytes("AS_OF_BEFORE_LATEST"));
        nav.postNAV(fundA, 1_000_001, 1_709_998_999, payloadB);
        vm.stopPrank();
    }

    function testNonManagerCannotPostNAV() public {
        vm.prank(stranger);
        vm.expectRevert();
        nav.postNAV(fundA, 1_000_000, 1_709_999_000, payloadA);
    }

    function testLatestNAVRejectsUnknownFund() public {
        vm.expectRevert(bytes("NO_NAV"));
        nav.latestNAV(fundA);
    }
}
