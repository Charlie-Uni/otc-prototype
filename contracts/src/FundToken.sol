// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "openzeppelin/token/ERC20/ERC20.sol";
import {Pausable} from "openzeppelin/utils/Pausable.sol";
import {AccessControl} from "openzeppelin/access/AccessControl.sol";

interface IRiskGate {
    function isGated(bytes32 fundId) external view returns (bool);
}

contract FundToken is ERC20, Pausable, AccessControl {
    bytes32 public constant SUBSCRIPTION_ROLE = keccak256("SUBSCRIPTION_ROLE");
    bytes32 public constant REDEMPTION_ROLE = keccak256("REDEMPTION_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    mapping(address => bool) public whitelist;
    IRiskGate public riskGate;
    bytes32 public fundId;

    event RiskGateConfigured(address indexed riskGate, bytes32 indexed fundId);

    constructor(address admin, string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    function setWhitelisted(address a, bool ok) external onlyRole(DEFAULT_ADMIN_ROLE) {
        whitelist[a] = ok;
    }

    function setRiskGate(address riskGate_, bytes32 fundId_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        riskGate = IRiskGate(riskGate_);
        fundId = fundId_;
        emit RiskGateConfigured(riskGate_, fundId_);
    }

    function mint(address to, uint256 amount) external onlyRole(SUBSCRIPTION_ROLE) {
        _mint(to, amount);
    }

    function burnFrom(address from, uint256 amount) external onlyRole(REDEMPTION_ROLE) {
        if (address(riskGate) != address(0)) {
            require(!riskGate.isGated(fundId), "REDEMPTION_GATED");
        }
        _burn(from, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (paused()) revert("PAUSED");
        // Optional: enforce receiver whitelist for p2p transfers (not during mint/burn)
        if (from != address(0) && to != address(0)) {
            require(whitelist[to], "RECEIVER_NOT_WHITELISTED");
        }
        super._update(from, to, value);
    }
}
