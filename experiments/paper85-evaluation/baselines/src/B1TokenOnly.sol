// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "openzeppelin/token/ERC20/ERC20.sol";
import {Ownable} from "openzeppelin/access/Ownable.sol";

/// @title B1 token-balance-only comparator
/// @notice Evaluation comparator, not a production design. It represents fund
/// shares as an issuer-controlled ERC-20 balance: the issuer mints and burns
/// share amounts computed off chain, and holders transfer freely. There is no
/// on-chain eligibility, NAV version, request lifecycle, operating status, or
/// semantic lifecycle event beyond the standard ERC-20 Transfer log.
contract B1TokenOnly is ERC20, Ownable {
    constructor(address issuer) ERC20("B1 Token-Only Fund Share", "B1FS") Ownable(issuer) {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}
