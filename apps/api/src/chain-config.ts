import { getAddress } from 'viem';

type FundBinding = {
  expectedFundId: `0x${string}`;
  actualFundId: `0x${string}`;
  expectedNavRegistry: `0x${string}`;
  actualNavRegistry: `0x${string}`;
};

export function assertFundBinding(binding: FundBinding): void {
  if (binding.actualFundId.toLowerCase() !== binding.expectedFundId.toLowerCase()) {
    throw new Error('FUND_ID_MISMATCH');
  }
  if (getAddress(binding.actualNavRegistry) !== getAddress(binding.expectedNavRegistry)) {
    throw new Error('NAV_REGISTRY_MISMATCH');
  }
}
