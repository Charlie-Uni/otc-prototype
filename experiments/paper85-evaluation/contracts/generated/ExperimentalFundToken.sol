// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "openzeppelin/token/ERC20/ERC20.sol";
import {Pausable} from "openzeppelin/utils/Pausable.sol";
import {AccessControl} from "openzeppelin/access/AccessControl.sol";
import {Math} from "openzeppelin/utils/math/Math.sol";
import {SafeCast} from "openzeppelin/utils/math/SafeCast.sol";

interface IRiskGate {
    function isGated(bytes32 fundId) external view returns (bool);
}

interface INAVRegistry {
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

    function latestNAV(bytes32 fundId) external view returns (NavRecord memory);
}

contract ExperimentalFundToken is ERC20, Pausable, AccessControl {
    bool public immutable enforceAuthorized;
    bool public immutable enforceCompliance;
    bool public immutable enforceNAVValidity;
    bool public immutable enforceLifecycleStatus;
    bool public immutable enforceParameterConsistency;
    uint16 public constant MAX_BPS = 10_000;
    uint256 public constant NAV_SCALE = 1e18;
    bytes32 public constant SUBSCRIPTION_ROLE = keccak256("SUBSCRIPTION_ROLE");
    bytes32 public constant REDEMPTION_ROLE = keccak256("REDEMPTION_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    struct SubscriptionRequest {
        address investor;
        uint256 subscriptionAmount;
        uint256 mintedShares;
        uint256 navUsed;
        uint64 navAsOf;
        uint64 requestedAt;
        uint64 acceptedAt;
        bytes32 requestHash;
        bool accepted;
    }

    struct RedemptionRequest {
        address investor;
        uint256 redeemedShares;
        uint256 redemptionAmount;
        uint256 settlementNav;
        uint64 settlementNavAsOf;
        uint64 requestedAt;
        uint64 settledAt;
        uint64 delayedAt;
        bytes32 delayReasonHash;
        bool settled;
        bool delayed;
    }

    mapping(address => bool) public whitelist;
    uint256 public subscriptionRequestCount;
    mapping(address => uint256) public queuedRedemptionOf;
    uint256 public totalQueuedRedemption;
    uint256 public redemptionRequestCount;
    IRiskGate public riskGate;
    INAVRegistry public immutable navRegistry;
    bytes32 public immutable fundId;
    mapping(uint256 => SubscriptionRequest) private subscriptionRequests;
    mapping(uint256 => RedemptionRequest) private redemptionRequests;

    event RiskGateConfigured(address indexed riskGate, bytes32 indexed fundId);
    event ShareBalanceUpdated(address indexed investor, uint256 balance, uint256 totalSupply, bytes32 indexed reason);
    event InvestorWhitelisted(address indexed investor, bool eligible, bytes32 indexed vcHash, address indexed by);
    event SubscriptionRequested(
        bytes32 indexed fundId,
        address indexed investor,
        uint256 indexed requestId,
        uint256 subscriptionAmount,
        uint64 requestedAt,
        bytes32 requestHash
    );
    event SubscriptionAccepted(
        bytes32 indexed fundId,
        address indexed investor,
        uint256 indexed requestId,
        uint256 subscriptionAmount,
        uint256 mintedShares,
        uint256 navUsed,
        uint64 navAsOf,
        uint64 requestedAt,
        uint64 acceptedAt,
        bytes32 requestHash
    );
    event RedemptionRequested(
        bytes32 indexed fundId,
        address indexed investor,
        uint256 indexed requestId,
        uint256 redeemedShares,
        uint64 requestedAt
    );
    event RedemptionQueueUpdated(
        bytes32 indexed fundId,
        uint256 totalQueuedRedemption,
        uint256 totalSupply,
        uint16 redemptionQueueRatioBps,
        uint64 updatedAt
    );
    event RedemptionSettled(
        bytes32 indexed fundId,
        address indexed investor,
        uint256 indexed requestId,
        uint256 redeemedShares,
        uint256 redemptionAmount,
        uint256 settlementNav,
        uint64 settlementNavAsOf,
        uint64 requestedAt,
        uint64 settledAt
    );
    event SettlementDelayed(
        bytes32 indexed fundId,
        address indexed investor,
        uint256 indexed requestId,
        uint256 redeemedShares,
        uint64 requestedAt,
        uint64 delayedAt,
        bytes32 reasonHash
    );

    constructor(
        address admin,
        string memory name_,
        string memory symbol_,
        bytes32 fundId_,
        address navRegistry_,
        bool enforceAuthorized_,
        bool enforceCompliance_,
        bool enforceNAVValidity_,
        bool enforceLifecycleStatus_,
        bool enforceParameterConsistency_
    ) ERC20(name_, symbol_) {
        enforceAuthorized = enforceAuthorized_;
        enforceCompliance = enforceCompliance_;
        enforceNAVValidity = enforceNAVValidity_;
        enforceLifecycleStatus = enforceLifecycleStatus_;
        enforceParameterConsistency = enforceParameterConsistency_;
        require(admin != address(0), "INVALID_ADMIN");
        require(fundId_ != bytes32(0), "INVALID_FUND_ID");
        require(navRegistry_ != address(0), "INVALID_NAV_REGISTRY");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        fundId = fundId_;
        navRegistry = INAVRegistry(navRegistry_);
    }

    modifier onlyRoleIfEnabled(bytes32 role) {
        if (enforceAuthorized) _checkRole(role);
        _;
    }

    function grantRole(bytes32 role, address account) public override {
        if (enforceAuthorized) _checkRole(getRoleAdmin(role));
        _grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) public override {
        if (enforceAuthorized) _checkRole(getRoleAdmin(role));
        _revokeRole(role, account);
    }

    function pause() external onlyRoleIfEnabled(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRoleIfEnabled(PAUSER_ROLE) {
        _unpause();
    }

    function setWhitelisted(address investor, bool eligible, bytes32 vcHash)
        external
        onlyRoleIfEnabled(DEFAULT_ADMIN_ROLE)
    {
        require(investor != address(0), "INVALID_INVESTOR");
        require(!eligible || vcHash != bytes32(0), "INVALID_VC_HASH");
        whitelist[investor] = eligible;
        emit InvestorWhitelisted(investor, eligible, vcHash, msg.sender);
    }

    function setRiskGate(address riskGate_) external onlyRoleIfEnabled(DEFAULT_ADMIN_ROLE) {
        require(riskGate_ != address(0), "INVALID_RISK_GATE");
        riskGate = IRiskGate(riskGate_);
        emit RiskGateConfigured(riskGate_, fundId);
    }

    function requestSubscription(uint256 amount) external returns (uint256 requestId) {
        return _requestSubscription(msg.sender, amount);
    }

    function requestSubscriptionFor(address investor, uint256 amount)
        external
        onlyRoleIfEnabled(SUBSCRIPTION_ROLE)
        returns (uint256 requestId)
    {
        return _requestSubscription(investor, amount);
    }

    function acceptSubscription(uint256 requestId) external onlyRoleIfEnabled(SUBSCRIPTION_ROLE) {
        SubscriptionRequest storage request = subscriptionRequests[requestId];
        require(request.investor != address(0), "UNKNOWN_SUBSCRIPTION_REQUEST");
        if (enforceParameterConsistency) require(!request.accepted, "SUBSCRIPTION_ALREADY_ACCEPTED");
        if (enforceCompliance) require(whitelist[request.investor], "NOT_WHITELISTED");
        INAVRegistry.NavRecord memory navRecord = navRegistry.latestNAV(fundId);
        uint256 mintedShares = Math.mulDiv(request.subscriptionAmount, NAV_SCALE, navRecord.nav);
        if (enforceParameterConsistency) require(mintedShares > 0, "SUBSCRIPTION_TOO_SMALL");

        request.accepted = true;
        request.acceptedAt = uint64(block.timestamp);
        request.mintedShares = mintedShares;
        request.navUsed = navRecord.nav;
        request.navAsOf = navRecord.asOf;

        emit SubscriptionAccepted(
            fundId,
            request.investor,
            requestId,
            request.subscriptionAmount,
            mintedShares,
            navRecord.nav,
            navRecord.asOf,
            request.requestedAt,
            request.acceptedAt,
            request.requestHash
        );
        _mint(request.investor, mintedShares);
    }

    function subscriptionRequestAt(uint256 requestId) external view returns (SubscriptionRequest memory) {
        SubscriptionRequest memory request = subscriptionRequests[requestId];
        require(request.investor != address(0), "UNKNOWN_SUBSCRIPTION_REQUEST");
        return request;
    }

    function requestRedemption(uint256 amount) external returns (uint256 requestId) {
        return _requestRedemption(msg.sender, amount);
    }

    function requestRedemptionFor(address investor, uint256 amount)
        external
        onlyRoleIfEnabled(REDEMPTION_ROLE)
        returns (uint256 requestId)
    {
        return _requestRedemption(investor, amount);
    }

    function settleRedemption(uint256 requestId) external onlyRoleIfEnabled(REDEMPTION_ROLE) {
        _requireNotGated();
        RedemptionRequest storage request = redemptionRequests[requestId];
        require(request.investor != address(0), "UNKNOWN_REDEMPTION_REQUEST");
        if (enforceParameterConsistency) require(!request.settled, "REDEMPTION_ALREADY_SETTLED");
        INAVRegistry.NavRecord memory navRecord = navRegistry.latestNAV(fundId);
        uint256 redemptionAmount = Math.mulDiv(request.redeemedShares, navRecord.nav, NAV_SCALE);
        if (enforceParameterConsistency) require(redemptionAmount > 0, "REDEMPTION_TOO_SMALL");

        request.settled = true;
        request.settledAt = uint64(block.timestamp);
        request.redemptionAmount = redemptionAmount;
        request.settlementNav = navRecord.nav;
        request.settlementNavAsOf = navRecord.asOf;
        totalQueuedRedemption -= request.redeemedShares;
        queuedRedemptionOf[request.investor] -= request.redeemedShares;

        _burn(request.investor, request.redeemedShares);

        emit RedemptionSettled(
            fundId,
            request.investor,
            requestId,
            request.redeemedShares,
            redemptionAmount,
            navRecord.nav,
            navRecord.asOf,
            request.requestedAt,
            request.settledAt
        );
        _emitRedemptionQueueUpdated();
    }

    function flagSettlementDelayed(uint256 requestId, bytes32 reasonHash) external onlyRoleIfEnabled(REDEMPTION_ROLE) {
        RedemptionRequest storage request = redemptionRequests[requestId];
        require(request.investor != address(0), "UNKNOWN_REDEMPTION_REQUEST");
        if (enforceParameterConsistency) require(!request.settled, "REDEMPTION_ALREADY_SETTLED");
        if (enforceParameterConsistency) require(!request.delayed, "SETTLEMENT_ALREADY_DELAYED");
        require(reasonHash != bytes32(0), "INVALID_REASON_HASH");

        request.delayed = true;
        request.delayedAt = uint64(block.timestamp);
        request.delayReasonHash = reasonHash;
        emit SettlementDelayed(
            fundId,
            request.investor,
            requestId,
            request.redeemedShares,
            request.requestedAt,
            request.delayedAt,
            reasonHash
        );
    }

    function redemptionRequestAt(uint256 requestId) external view returns (RedemptionRequest memory) {
        RedemptionRequest memory request = redemptionRequests[requestId];
        require(request.investor != address(0), "UNKNOWN_REDEMPTION_REQUEST");
        return request;
    }

    function redemptionQueueRatioBps() public view returns (uint16) {
        uint256 supply = totalSupply();
        if (supply == 0) {
            return 0;
        }
        uint256 ratioBps = (totalQueuedRedemption * MAX_BPS) / supply;
        if (ratioBps > MAX_BPS) {
            return MAX_BPS;
        }
        return SafeCast.toUint16(ratioBps);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (enforceLifecycleStatus && paused()) revert("PAUSED");
        // Preserve eligibility and queued-share availability on peer transfers.
        if (from != address(0) && to != address(0)) {
            if (enforceCompliance) require(whitelist[to], "RECEIVER_NOT_WHITELISTED");
            _requireAvailableShares(from, value);
        }
        super._update(from, to, value);
        bytes32 reason = _shareUpdateReason(from, to);
        if (from != address(0)) {
            emit ShareBalanceUpdated(from, balanceOf(from), totalSupply(), reason);
        }
        if (to != address(0) && to != from) {
            emit ShareBalanceUpdated(to, balanceOf(to), totalSupply(), reason);
        }
    }

    function _shareUpdateReason(address from, address to) private pure returns (bytes32) {
        if (from == address(0)) return keccak256("SHARE_MINTED");
        if (to == address(0)) return keccak256("SHARE_BURNED");
        return keccak256("SHARE_TRANSFERRED");
    }

    function _requestSubscription(address investor, uint256 subscriptionAmount) private returns (uint256 requestId) {
        require(investor != address(0), "INVALID_INVESTOR");
        if (enforceCompliance) require(whitelist[investor], "NOT_WHITELISTED");
        if (enforceParameterConsistency) require(subscriptionAmount > 0, "INVALID_SUBSCRIPTION_AMOUNT");

        requestId = subscriptionRequestCount;
        subscriptionRequestCount += 1;
        uint64 requestedAt = uint64(block.timestamp);
        bytes32 requestHash = keccak256(
            abi.encode(block.chainid, address(this), fundId, requestId, investor, subscriptionAmount, requestedAt)
        );
        subscriptionRequests[requestId] = SubscriptionRequest({
            investor: investor,
            subscriptionAmount: subscriptionAmount,
            mintedShares: 0,
            navUsed: 0,
            navAsOf: 0,
            requestedAt: requestedAt,
            acceptedAt: 0,
            requestHash: requestHash,
            accepted: false
        });

        emit SubscriptionRequested(fundId, investor, requestId, subscriptionAmount, requestedAt, requestHash);
    }

    function _requestRedemption(address investor, uint256 redeemedShares) private returns (uint256 requestId) {
        require(investor != address(0), "INVALID_INVESTOR");
        if (enforceCompliance) require(whitelist[investor], "NOT_WHITELISTED");
        if (enforceParameterConsistency) require(redeemedShares > 0, "INVALID_REDEMPTION_AMOUNT");
        _requireNotGated();
        _requireAvailableShares(investor, redeemedShares);

        requestId = redemptionRequestCount;
        redemptionRequestCount += 1;
        uint64 requestedAt = uint64(block.timestamp);
        redemptionRequests[requestId] = RedemptionRequest({
            investor: investor,
            redeemedShares: redeemedShares,
            redemptionAmount: 0,
            settlementNav: 0,
            settlementNavAsOf: 0,
            requestedAt: requestedAt,
            settledAt: 0,
            delayedAt: 0,
            delayReasonHash: bytes32(0),
            settled: false,
            delayed: false
        });
        queuedRedemptionOf[investor] += redeemedShares;
        totalQueuedRedemption += redeemedShares;

        emit RedemptionRequested(fundId, investor, requestId, redeemedShares, requestedAt);
        _emitRedemptionQueueUpdated();
    }

    function _requireAvailableShares(address investor, uint256 amount) private view {
        uint256 balance = balanceOf(investor);
        uint256 queued = queuedRedemptionOf[investor];
        if (enforceParameterConsistency) require(balance >= queued, "INVALID_QUEUED_BALANCE");
        if (enforceParameterConsistency) {
            require(balance - queued >= amount, "INSUFFICIENT_AVAILABLE_SHARES");
        }
    }

    function _requireNotGated() private view {
        require(address(riskGate) != address(0), "RISK_GATE_NOT_CONFIGURED");
        require(!riskGate.isGated(fundId), "REDEMPTION_GATED");
    }

    function _emitRedemptionQueueUpdated() private {
        emit RedemptionQueueUpdated(
            fundId, totalQueuedRedemption, totalSupply(), redemptionQueueRatioBps(), uint64(block.timestamp)
        );
    }
}
