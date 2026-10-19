// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "openzeppelin/token/ERC20/ERC20.sol";
import {AccessControl} from "openzeppelin/access/AccessControl.sol";
import {Pausable} from "openzeppelin/utils/Pausable.sol";

/// @title B2 conventional permissioned token with a simple allowlist
/// @notice Evaluation comparator, not a production design. It adds the
/// controls commonly found in permissioned security tokens to B1: role-based
/// issuance, an allowlist enforced on every non-zero sender and receiver
/// (including mint and burn counterparties), and a global pause. It does not
/// model NAV versions, subscription/redemption requests, queued shares,
/// disposition states, evidence references on share movements, or semantic
/// lifecycle events. Share amounts are computed off chain.
contract B2PermissionedAllowlist is ERC20, AccessControl, Pausable {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    mapping(address account => bool allowed) public allowlisted;

    event AllowlistUpdated(address indexed account, bool allowed);

    error AccountNotAllowlisted(address account);

    constructor(address admin) ERC20("B2 Permissioned Fund Share", "B2FS") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function setAllowlisted(address account, bool allowed) external onlyRole(COMPLIANCE_ROLE) {
        allowlisted[account] = allowed;
        emit AllowlistUpdated(account, allowed);
    }

    function mint(address to, uint256 amount) external onlyRole(ISSUER_ROLE) {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyRole(ISSUER_ROLE) {
        _burn(from, amount);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _update(address from, address to, uint256 value) internal override whenNotPaused {
        if (from != address(0) && !allowlisted[from]) revert AccountNotAllowlisted(from);
        if (to != address(0) && !allowlisted[to]) revert AccountNotAllowlisted(to);
        super._update(from, to, value);
    }
}
