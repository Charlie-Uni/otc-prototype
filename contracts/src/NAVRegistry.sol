// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "openzeppelin/access/AccessControl.sol";

contract NAVRegistry is AccessControl {
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    struct NavRecord { uint256 nav; uint256 asOf; uint256 storedAt; }
    event NavPosted(uint256 nav, uint256 asOf, uint256 storedAt, address indexed by);

    NavRecord[] public history;

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MANAGER_ROLE, admin);
    }

    function postNAV(uint256 nav, uint256 asOf) external onlyRole(MANAGER_ROLE) {
        history.push(NavRecord({nav: nav, asOf: asOf, storedAt: block.timestamp}));
        emit NavPosted(nav, asOf, block.timestamp, msg.sender);
    }

    function latestNAV() external view returns (NavRecord memory) {
        require(history.length > 0, "NO_NAV");
        return history[history.length - 1];
    }

    function historyLength() external view returns (uint256) { return history.length; }
}
