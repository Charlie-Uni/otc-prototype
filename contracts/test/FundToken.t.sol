// test/FundToken.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import {FundToken} from "src/FundToken.sol";
import {RiskRegistry} from "src/RiskRegistry.sol";

contract FundTokenTest is Test {
    FundToken token;
    RiskRegistry risk;
    address admin = address(this);          // <-- test contract is admin
    address alice = address(0xBEEF);
    bytes32 fundId = keccak256("OTC_FUND_1");
    bytes32 payloadHash = keccak256("payload");

    function setUp() public {
        risk = new RiskRegistry(admin, _validWeights(), uint64(30 days), 7_000);
        token = new FundToken(admin, "OTC Fund", "OTCF");   // pass admin = this
        token.setWhitelisted(alice, true);                  // no prank needed
        token.setRiskGate(address(risk), fundId);
        token.grantRole(token.SUBSCRIPTION_ROLE(), admin);
        token.grantRole(token.REDEMPTION_ROLE(), admin);
    }

    function testMintBurn() public {
        token.mint(alice, 1e18);
        assertEq(token.balanceOf(alice), 1e18);
        token.burnFrom(alice, 5e17);
        assertEq(token.balanceOf(alice), 5e17);
    }

    function testBurnWithoutRiskGateStillWorks() public {
        FundToken ungatedToken = new FundToken(admin, "OTC Fund", "OTCF");
        ungatedToken.grantRole(ungatedToken.SUBSCRIPTION_ROLE(), admin);
        ungatedToken.grantRole(ungatedToken.REDEMPTION_ROLE(), admin);

        ungatedToken.mint(alice, 1e18);
        ungatedToken.burnFrom(alice, 5e17);

        assertEq(ungatedToken.balanceOf(alice), 5e17);
    }

    function testPauseBlocksTransfer() public {
        token.mint(admin, 1e18);
        token.setWhitelisted(address(0xCAFE), true);
        token.pause();
        vm.expectRevert();
        token.transfer(address(0xCAFE), 1);
    }

    function testGateBlocksAndReleaseRestoresRedemption() public {
        token.mint(alice, 1e18);

        risk.submitMetrics(fundId, _highRiskMetrics(), _score(_highRiskMetrics()), 1, uint64(block.timestamp), payloadHash);
        assertTrue(risk.isGated(fundId));

        vm.expectRevert(bytes("REDEMPTION_GATED"));
        token.burnFrom(alice, 5e17);

        risk.releaseGate(fundId, keccak256("risk normalized"));
        token.burnFrom(alice, 5e17);

        assertEq(token.balanceOf(alice), 5e17);
    }

    function _validWeights() private pure returns (uint16[6] memory weights) {
        weights = [uint16(2_000), 2_000, 2_000, 2_000, 1_000, 1_000];
    }

    function _highRiskMetrics() private pure returns (RiskRegistry.RiskMetrics memory) {
        return RiskRegistry.RiskMetrics({
            valuationHaircutBps: 8_000,
            redemptionPressureBps: 8_500,
            redemptionQueueRatioBps: 7_900,
            liquidityShortfallBps: 8_800,
            stalePricingRiskBps: 7_500,
            investorConcentrationBps: 7_800
        });
    }

    function _score(RiskRegistry.RiskMetrics memory metrics) private pure returns (uint16) {
        return uint16(
            (
                uint256(metrics.valuationHaircutBps) * 2_000 + uint256(metrics.redemptionPressureBps) * 2_000
                    + uint256(metrics.redemptionQueueRatioBps) * 2_000
                    + uint256(metrics.liquidityShortfallBps) * 2_000
                    + uint256(metrics.stalePricingRiskBps) * 1_000
                    + uint256(metrics.investorConcentrationBps) * 1_000
            ) / 10_000
        );
    }
}
