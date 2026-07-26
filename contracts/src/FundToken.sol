// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "openzeppelin/token/ERC20/ERC20.sol";
import {Pausable} from "openzeppelin/utils/Pausable.sol";
import {AccessControl} from "openzeppelin/access/AccessControl.sol";
import {SafeCast} from "openzeppelin/utils/math/SafeCast.sol";

interface IRiskGate {
    function isGated(bytes32 fundId) external view returns (bool);
}

contract FundToken is ERC20, Pausable, AccessControl {
    uint16 public constant MAX_BPS = 10_000;
    bytes32 public constant SUBSCRIPTION_ROLE = keccak256("SUBSCRIPTION_ROLE");
    bytes32 public constant REDEMPTION_ROLE = keccak256("REDEMPTION_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    struct RedemptionRequest {
        address investor;
        uint256 amount;
        uint64 requestedAt;
        uint64 settledAt;
        bool settled;
    }

    mapping(address => bool) public whitelist;
    mapping(address => uint256) public queuedRedemptionOf;
    uint256 public totalQueuedRedemption;
    uint256 public redemptionRequestCount;
    IRiskGate public riskGate;
    bytes32 public fundId;
    mapping(uint256 => RedemptionRequest) private redemptionRequests;

    event RiskGateConfigured(address indexed riskGate, bytes32 indexed fundId);
    event ShareBalanceUpdated(
        address indexed investor,
        uint256 balance,
        uint256 totalSupply,
        bytes32 indexed reason
    );
    event InvestorWhitelisted(address indexed investor, bool eligible, bytes32 indexed vcHash, address indexed by);
    event RedemptionRequested(
        bytes32 indexed fundId,
        address indexed investor,
        uint256 indexed requestId,
        uint256 amount,
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
        uint256 amount,
        uint64 requestedAt,
        uint64 settledAt
    );
    event SettlementDelayed(
        bytes32 indexed fundId,
        address indexed investor,
        uint256 indexed requestId,
        uint256 amount,
        uint64 requestedAt,
        uint64 observedAt,
        bytes32 reasonHash
    );

    constructor(address admin, string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    function setWhitelisted(address investor, bool eligible, bytes32 vcHash) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(investor != address(0), "INVALID_INVESTOR");
        whitelist[investor] = eligible;
        emit InvestorWhitelisted(investor, eligible, vcHash, msg.sender);
    }

    function setRiskGate(address riskGate_, bytes32 fundId_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        riskGate = IRiskGate(riskGate_);
        fundId = fundId_;
        emit RiskGateConfigured(riskGate_, fundId_);
    }

    function mint(address to, uint256 amount) external onlyRole(SUBSCRIPTION_ROLE) {
        require(whitelist[to], "NOT_WHITELISTED");
        _mint(to, amount);
    }

    function requestRedemption(uint256 amount) external returns (uint256 requestId) {
        return _requestRedemption(msg.sender, amount);
    }

    function requestRedemptionFor(address investor, uint256 amount)
        external
        onlyRole(REDEMPTION_ROLE)
        returns (uint256 requestId)
    {
        return _requestRedemption(investor, amount);
    }

    function settleRedemption(uint256 requestId) external onlyRole(REDEMPTION_ROLE) {
        _requireNotGated();
        RedemptionRequest storage request = redemptionRequests[requestId];
        require(request.investor != address(0), "UNKNOWN_REDEMPTION_REQUEST");
        require(!request.settled, "REDEMPTION_ALREADY_SETTLED");

        request.settled = true;
        request.settledAt = uint64(block.timestamp);
        totalQueuedRedemption -= request.amount;
        queuedRedemptionOf[request.investor] -= request.amount;

        _burn(request.investor, request.amount);

        emit RedemptionSettled(
            fundId,
            request.investor,
            requestId,
            request.amount,
            request.requestedAt,
            request.settledAt
        );
        _emitRedemptionQueueUpdated();
    }

    function flagSettlementDelayed(uint256 requestId, bytes32 reasonHash) external onlyRole(REDEMPTION_ROLE) {
        RedemptionRequest storage request = redemptionRequests[requestId];
        require(request.investor != address(0), "UNKNOWN_REDEMPTION_REQUEST");
        require(!request.settled, "REDEMPTION_ALREADY_SETTLED");

        emit SettlementDelayed(
            fundId,
            request.investor,
            requestId,
            request.amount,
            request.requestedAt,
            uint64(block.timestamp),
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
        if (paused()) revert("PAUSED");
        // Optional: enforce receiver whitelist for p2p transfers (not during mint/burn)
        if (from != address(0) && to != address(0)) {
            require(whitelist[to], "RECEIVER_NOT_WHITELISTED");
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

    function _requestRedemption(address investor, uint256 amount) private returns (uint256 requestId) {
        require(investor != address(0), "INVALID_INVESTOR");
        require(whitelist[investor], "NOT_WHITELISTED");
        require(amount > 0, "INVALID_REDEMPTION_AMOUNT");
        _requireNotGated();
        _requireAvailableShares(investor, amount);

        requestId = redemptionRequestCount;
        redemptionRequestCount += 1;
        uint64 requestedAt = uint64(block.timestamp);
        redemptionRequests[requestId] = RedemptionRequest({
            investor: investor,
            amount: amount,
            requestedAt: requestedAt,
            settledAt: 0,
            settled: false
        });
        queuedRedemptionOf[investor] += amount;
        totalQueuedRedemption += amount;

        emit RedemptionRequested(fundId, investor, requestId, amount, requestedAt);
        _emitRedemptionQueueUpdated();
    }

    function _requireAvailableShares(address investor, uint256 amount) private view {
        uint256 balance = balanceOf(investor);
        uint256 queued = queuedRedemptionOf[investor];
        require(balance >= queued, "INVALID_QUEUED_BALANCE");
        require(balance - queued >= amount, "INSUFFICIENT_AVAILABLE_SHARES");
    }

    function _requireNotGated() private view {
        if (address(riskGate) != address(0)) {
            require(!riskGate.isGated(fundId), "REDEMPTION_GATED");
        }
    }

    function _emitRedemptionQueueUpdated() private {
        emit RedemptionQueueUpdated(
            fundId,
            totalQueuedRedemption,
            totalSupply(),
            redemptionQueueRatioBps(),
            uint64(block.timestamp)
        );
    }
}
