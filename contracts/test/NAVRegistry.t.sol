// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {Math} from "openzeppelin/utils/math/Math.sol";
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
        uint256 netAssetValue,
        uint256 totalSharesSnapshot,
        uint64 asOf,
        uint64 storedAt,
        int256 navAdjustmentBps,
        bytes32 payloadHash,
        bool isInitial,
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

    function testInitialNAVStoresFundScopedOfferingPriceAndCommitment() public {
        vm.expectEmit(true, true, false, true, address(nav));
        emit NAVUpdatedEvent(fundA, 1e18, 0, 0, 1_709_999_000, uint64(block.timestamp), 0, payloadA, true, admin);

        vm.prank(admin);
        nav.postInitialNAV(fundA, 1e18, 1_709_999_000, payloadA);

        NAVRegistry.NavRecord memory record = nav.latestNAV(fundA);
        assertEq(record.nav, 1e18);
        assertEq(record.netAssetValue, 0);
        assertEq(record.totalSharesSnapshot, 0);
        assertEq(record.asOf, 1_709_999_000);
        assertEq(record.storedAt, block.timestamp);
        assertEq(record.navAdjustmentBps, 0);
        assertEq(record.payloadHash, payloadA);
        assertTrue(record.isInitial);
        assertEq(nav.historyLength(fundA), 1);
        assertEq(nav.historyLength(fundB), 0);
    }

    function testPostNAVComputesFormulaOnChainAndStoresInputs() public {
        vm.startPrank(admin);
        nav.postInitialNAV(fundA, 1e18, 1_709_999_000, payloadA);

        vm.expectEmit(true, true, false, true, address(nav));
        emit NAVUpdatedEvent(
            fundA, 1.1e18, 1_100e18, 1_000e18, 1_709_999_500, uint64(block.timestamp), 1_000, payloadB, false, admin
        );
        nav.postNAV(fundA, 1_100e18, 1_000e18, 1_709_999_500, payloadB);
        vm.stopPrank();

        NAVRegistry.NavRecord memory record = nav.latestNAV(fundA);
        assertEq(record.nav, 1.1e18);
        assertEq(record.netAssetValue, 1_100e18);
        assertEq(record.totalSharesSnapshot, 1_000e18);
        assertEq(record.navAdjustmentBps, 1_000);
        assertFalse(record.isInitial);
    }

    function testFuzz_PostNAVAlwaysMatchesNetAssetValueOverShares(uint128 rawNetAssets, uint128 rawShares) public {
        uint256 netAssetValue = bound(uint256(rawNetAssets), 1e18, 1e30);
        uint256 totalSharesSnapshot = bound(uint256(rawShares), 1, 1e24);
        vm.startPrank(admin);
        nav.postInitialNAV(fundA, 1e18, 1_709_999_000, payloadA);
        nav.postNAV(fundA, netAssetValue, totalSharesSnapshot, 1_709_999_001, payloadB);
        vm.stopPrank();

        NAVRegistry.NavRecord memory record = nav.latestNAV(fundA);
        assertEq(record.nav, Math.mulDiv(netAssetValue, nav.NAV_SCALE(), totalSharesSnapshot));
        assertEq(record.netAssetValue, netAssetValue);
        assertEq(record.totalSharesSnapshot, totalSharesSnapshot);
    }

    function testNAVAdjustmentSupportsPositiveAndNegativeFormulaChanges() public {
        vm.startPrank(admin);
        nav.postInitialNAV(fundA, 1e18, 1_709_999_000, payloadA);
        nav.postNAV(fundA, 1_100e18, 1_000e18, 1_709_999_500, payloadB);
        nav.postNAV(fundA, 990e18, 1_000e18, 1_709_999_800, keccak256("nav-c"));
        vm.stopPrank();

        assertEq(nav.navAt(fundA, 1).navAdjustmentBps, 1_000);
        assertEq(nav.navAt(fundA, 2).navAdjustmentBps, -1_000);
        assertEq(nav.historyLength(fundA), 3);
    }

    function testFundHistoriesAreIsolated() public {
        vm.startPrank(admin);
        nav.postInitialNAV(fundA, 1e18, 1_709_999_000, payloadA);
        nav.postInitialNAV(fundB, 2e18, 1_709_999_000, payloadB);
        vm.stopPrank();

        assertEq(nav.latestNAV(fundA).nav, 1e18);
        assertEq(nav.latestNAV(fundB).nav, 2e18);
    }

    function testInitialNAVRejectsInvalidStateAndDuplicateInitialization() public {
        vm.startPrank(admin);
        vm.expectRevert(bytes("INVALID_FUND_ID"));
        nav.postInitialNAV(bytes32(0), 1e18, 1, payloadA);

        vm.expectRevert(bytes("INVALID_NAV"));
        nav.postInitialNAV(fundA, 0, 1, payloadA);

        vm.expectRevert(bytes("INVALID_AS_OF"));
        nav.postInitialNAV(fundA, 1e18, 0, payloadA);

        vm.expectRevert(bytes("FUTURE_AS_OF"));
        nav.postInitialNAV(fundA, 1e18, uint64(block.timestamp + 1), payloadA);

        vm.expectRevert(bytes("INVALID_PAYLOAD_HASH"));
        nav.postInitialNAV(fundA, 1e18, 1, bytes32(0));

        nav.postInitialNAV(fundA, 1e18, 1_709_999_000, payloadA);
        vm.expectRevert(bytes("NAV_ALREADY_INITIALIZED"));
        nav.postInitialNAV(fundA, 1e18, 1_709_999_001, payloadB);
        vm.stopPrank();
    }

    function testFormulaNAVRequiresInitializationAndPositiveInputs() public {
        vm.startPrank(admin);
        vm.expectRevert(bytes("NAV_NOT_INITIALIZED"));
        nav.postNAV(fundA, 1_000e18, 1_000e18, 1_709_999_000, payloadA);

        nav.postInitialNAV(fundA, 1e18, 1_709_999_000, payloadA);
        vm.expectRevert(bytes("INVALID_NET_ASSET_VALUE"));
        nav.postNAV(fundA, 0, 1_000e18, 1_709_999_001, payloadB);

        vm.expectRevert(bytes("INVALID_TOTAL_SHARES"));
        nav.postNAV(fundA, 1_000e18, 0, 1_709_999_001, payloadB);

        vm.expectRevert(bytes("AS_OF_BEFORE_LATEST"));
        nav.postNAV(fundA, 1_000e18, 1_000e18, 1_709_998_999, payloadB);
        vm.stopPrank();
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

    function testNonManagerCannotPostNAV() public {
        vm.prank(stranger);
        vm.expectRevert();
        nav.postInitialNAV(fundA, 1e18, 1_709_999_000, payloadA);
    }

    function testLatestNAVRejectsUnknownFund() public {
        vm.expectRevert(bytes("NO_NAV"));
        nav.latestNAV(fundA);
    }

    function testDeploymentRejectsZeroAdmin() public {
        vm.expectRevert(bytes("INVALID_ADMIN"));
        new NAVRegistry(address(0));
    }
}
