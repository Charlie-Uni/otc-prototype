// apps/api/src/chain.ts
import { createWalletClient, createPublicClient, getContract, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { ENV } from './env';

export const account = privateKeyToAccount(ENV.PRIVATE_KEY as `0x${string}`);

export const rpc = createPublicClient({
  chain: foundry,
  transport: http(ENV.RPC_URL),
});

export const wallet = createWalletClient({
  account,
  chain: foundry,
  transport: http(ENV.RPC_URL),
});

// ---- remove the overcomplicated typing; cast clients to any ----
const clients = { public: rpc as any, wallet: wallet as any };

// NAV contract
export const nav = getContract({
  address: ENV.NAV_REGISTRY_ADDRESS as `0x${string}`,
  abi: parseAbi([
    'function postNAV(uint256 nav, uint256 asOf) external',
    'function latestNAV() view returns (uint256 nav, uint256 asOf, uint256 storedAt)',
  ]),
  client: clients as any,
});

// Token contract
export const token = getContract({
  address: ENV.FUND_TOKEN_ADDRESS as `0x${string}`,
  abi: parseAbi([
    'function mint(address to, uint256 amount) external',
    'function burnFrom(address from, uint256 amount) external',
    'function balanceOf(address a) view returns (uint256)',
    'function setWhitelisted(address a, bool ok) external',
  ]),
  client: clients as any,
});
