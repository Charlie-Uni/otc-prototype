import { getAddress } from 'viem';
import { ApiRole } from './role-auth';

export function canReadHolderAddress(
  role: ApiRole | undefined,
  requestedAddress: string,
  investorAddress: string,
): boolean {
  if (role !== 'investor') return true;
  return getAddress(requestedAddress) === getAddress(investorAddress);
}
