// apps/api/src/chain.ts
import { createWalletClient, createPublicClient, getContract, http, keccak256, parseAbi, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { ENV } from './env';

export const account = privateKeyToAccount(ENV.PRIVATE_KEY as `0x${string}`);
export const oracleAccount = privateKeyToAccount(ENV.ORACLE_PRIVATE_KEY as `0x${string}`);
export const fundId = keccak256(toBytes(ENV.FUND_ID_LABEL)) as `0x${string}`;

export const rpc = createPublicClient({
  chain: foundry,
  transport: http(ENV.RPC_URL),
});

export const wallet = createWalletClient({
  account,
  chain: foundry,
  transport: http(ENV.RPC_URL),
});

export const oracleWallet = createWalletClient({
  account: oracleAccount,
  chain: foundry,
  transport: http(ENV.RPC_URL),
});

// ---- remove the overcomplicated typing; cast clients to any ----
const clients = { public: rpc as any, wallet: wallet as any };
const oracleClients = { public: rpc as any, wallet: oracleWallet as any };

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

// Risk registry. Writes are signed by the oracle account; reads come from the same public client.
export const riskRegistry = getContract({
  address: ENV.RISK_REGISTRY_ADDRESS as `0x${string}`,
  abi: parseAbi([
    'function activeWeightsConfigId() view returns (uint64)',
    'function getWeightsConfig(uint64 weightsConfigId) view returns (uint16[6] weightBps, uint64 maxStaleAgeSec, bytes32 weightsHash, bool exists)',
    'function submitMetrics(bytes32 fundId, (uint16 valuationHaircutBps, uint16 redemptionPressureBps, uint16 redemptionQueueRatioBps, uint16 liquidityShortfallBps, uint16 stalePricingRiskBps, uint16 investorConcentrationBps) metrics, uint16 riskScoreBps, uint64 weightsConfigId, uint64 occurredAt, bytes32 payloadHash) returns (uint256 snapshotId)',
    'function latestSnapshot(bytes32 fundId) view returns ((bytes32 fundId, (uint16 valuationHaircutBps, uint16 redemptionPressureBps, uint16 redemptionQueueRatioBps, uint16 liquidityShortfallBps, uint16 stalePricingRiskBps, uint16 investorConcentrationBps) metrics, uint16 riskScoreBps, uint16 kappaBps, uint64 weightsConfigId, uint64 occurredAt, uint64 submittedAt, bytes32 metricsHash, bytes32 payloadHash, address submittedBy) snapshot)',
    'function snapshotAt(bytes32 fundId, uint256 index) view returns ((bytes32 fundId, (uint16 valuationHaircutBps, uint16 redemptionPressureBps, uint16 redemptionQueueRatioBps, uint16 liquidityShortfallBps, uint16 stalePricingRiskBps, uint16 investorConcentrationBps) metrics, uint16 riskScoreBps, uint16 kappaBps, uint64 weightsConfigId, uint64 occurredAt, uint64 submittedAt, bytes32 metricsHash, bytes32 payloadHash, address submittedBy) snapshot)',
    'function historyLength(bytes32 fundId) view returns (uint256)',
    'function isGated(bytes32 fundId) view returns (bool)',
    'function effectiveKappaBps(bytes32 fundId) view returns (uint16)',
  ]),
  client: oracleClients as any,
});
