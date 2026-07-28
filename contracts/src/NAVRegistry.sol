// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "openzeppelin/access/AccessControl.sol";
import {Math} from "openzeppelin/utils/math/Math.sol";
import {SafeCast} from "openzeppelin/utils/math/SafeCast.sol";

contract NAVRegistry is AccessControl {
    uint256 public constant MAX_BPS = 10_000;
    uint256 public constant NAV_SCALE = 1e18;
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    struct NavRecord {
        uint256 nav;
        uint256 netAssetValue;
        uint256 totalSharesSnapshot;
        uint64 asOf;
        uint64 storedAt;
        int256 navAdjustmentBps;
        bytes32 payloadHash;
        bool isInitial;
    }

    struct ValuationHaircutSnapshot {
        uint16 valuationHaircutBps;
        uint64 occurredAt;
        uint64 submittedAt;
        bytes32 payloadHash;
        address submittedBy;
        bool exists;
    }

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

    mapping(bytes32 => NavRecord[]) private histories;
    mapping(bytes32 => ValuationHaircutSnapshot) private valuationHaircuts;

    constructor(address admin) {
        require(admin != address(0), "INVALID_ADMIN");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MANAGER_ROLE, admin);
    }

    function postInitialNAV(bytes32 fundId, uint256 initialNav, uint64 asOf, bytes32 payloadHash)
        external
        onlyRole(MANAGER_ROLE)
    {
        _validateNAVSubmission(fundId, asOf, payloadHash);
        require(initialNav > 0, "INVALID_NAV");
        require(histories[fundId].length == 0, "NAV_ALREADY_INITIALIZED");
        _storeNAV(fundId, initialNav, 0, 0, asOf, payloadHash, true);
    }

    function postNAV(
        bytes32 fundId,
        uint256 netAssetValue,
        uint256 totalSharesSnapshot,
        uint64 asOf,
        bytes32 payloadHash
    ) external onlyRole(MANAGER_ROLE) {
        _validateNAVSubmission(fundId, asOf, payloadHash);
        require(histories[fundId].length > 0, "NAV_NOT_INITIALIZED");
        require(netAssetValue > 0, "INVALID_NET_ASSET_VALUE");
        require(totalSharesSnapshot > 0, "INVALID_TOTAL_SHARES");

        uint256 nav = Math.mulDiv(netAssetValue, NAV_SCALE, totalSharesSnapshot);
        require(nav > 0, "INVALID_NAV");
        _storeNAV(fundId, nav, netAssetValue, totalSharesSnapshot, asOf, payloadHash, false);
    }

    function _validateNAVSubmission(bytes32 fundId, uint64 asOf, bytes32 payloadHash) private view {
        require(fundId != bytes32(0), "INVALID_FUND_ID");
        require(asOf > 0, "INVALID_AS_OF");
        require(asOf <= block.timestamp, "FUTURE_AS_OF");
        require(payloadHash != bytes32(0), "INVALID_PAYLOAD_HASH");
    }

    function _storeNAV(
        bytes32 fundId,
        uint256 nav,
        uint256 netAssetValue,
        uint256 totalSharesSnapshot,
        uint64 asOf,
        bytes32 payloadHash,
        bool isInitial
    ) private {
        NavRecord[] storage history = histories[fundId];
        if (history.length > 0) {
            require(asOf >= history[history.length - 1].asOf, "AS_OF_BEFORE_LATEST");
        }
        int256 adjustmentBps = history.length == 0 ? int256(0) : _navAdjustmentBps(history[history.length - 1].nav, nav);
        uint64 storedAt = uint64(block.timestamp);
        history.push(
            NavRecord({
                nav: nav,
                netAssetValue: netAssetValue,
                totalSharesSnapshot: totalSharesSnapshot,
                asOf: asOf,
                storedAt: storedAt,
                navAdjustmentBps: adjustmentBps,
                payloadHash: payloadHash,
                isInitial: isInitial
            })
        );
        emit NAVUpdatedEvent(
            fundId,
            nav,
            netAssetValue,
            totalSharesSnapshot,
            asOf,
            storedAt,
            adjustmentBps,
            payloadHash,
            isInitial,
            msg.sender
        );
    }

    function latestNAV(bytes32 fundId) external view returns (NavRecord memory) {
        NavRecord[] storage history = histories[fundId];
        require(history.length > 0, "NO_NAV");
        return history[history.length - 1];
    }

    function postValuationHaircut(bytes32 fundId, uint16 valuationHaircutBps, uint64 occurredAt, bytes32 payloadHash)
        external
        onlyRole(MANAGER_ROLE)
    {
        require(fundId != bytes32(0), "INVALID_FUND_ID");
        require(valuationHaircutBps <= MAX_BPS, "BPS_OUT_OF_RANGE");
        require(occurredAt > 0, "INVALID_OCCURRED_AT");
        require(occurredAt <= block.timestamp, "FUTURE_OCCURRED_AT");
        require(payloadHash != bytes32(0), "INVALID_PAYLOAD_HASH");
        ValuationHaircutSnapshot storage previous = valuationHaircuts[fundId];
        // Overwrite-style snapshot: keep occurredAt monotone (>= allows same-time corrections),
        // matching the NAV asOf ordering rule so "latest" can never move backwards in time.
        require(!previous.exists || occurredAt >= previous.occurredAt, "OCCURRED_AT_BEFORE_LATEST");

        uint64 submittedAt = uint64(block.timestamp);
        valuationHaircuts[fundId] = ValuationHaircutSnapshot({
            valuationHaircutBps: valuationHaircutBps,
            occurredAt: occurredAt,
            submittedAt: submittedAt,
            payloadHash: payloadHash,
            submittedBy: msg.sender,
            exists: true
        });
        emit ValuationHaircutEvent(fundId, valuationHaircutBps, occurredAt, submittedAt, payloadHash, msg.sender);
    }

    function latestValuationHaircut(bytes32 fundId) external view returns (ValuationHaircutSnapshot memory) {
        ValuationHaircutSnapshot memory snapshot = valuationHaircuts[fundId];
        require(snapshot.exists, "NO_VALUATION_HAIRCUT");
        return snapshot;
    }

    function navAt(bytes32 fundId, uint256 index) external view returns (NavRecord memory) {
        require(index < histories[fundId].length, "NAV_OUT_OF_RANGE");
        return histories[fundId][index];
    }

    function historyLength(bytes32 fundId) external view returns (uint256) {
        return histories[fundId].length;
    }

    function _navAdjustmentBps(uint256 previousNav, uint256 currentNav) private pure returns (int256) {
        if (currentNav >= previousNav) {
            return SafeCast.toInt256(Math.mulDiv(currentNav - previousNav, MAX_BPS, previousNav));
        }
        return -SafeCast.toInt256(Math.mulDiv(previousNav - currentNav, MAX_BPS, previousNav));
    }
}
