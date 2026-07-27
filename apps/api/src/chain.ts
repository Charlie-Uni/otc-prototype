// apps/api/src/chain.ts
import { createWalletClient, createPublicClient, getContract, http, keccak256, parseAbi, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { ENV } from './env';

export const account = privateKeyToAccount(ENV.PRIVATE_KEY as `0x${string}`);
export const oracleAccount = privateKeyToAccount(ENV.ORACLE_PRIVATE_KEY as `0x${string}`);
export const regulatorAccount = privateKeyToAccount(ENV.REGULATOR_PRIVATE_KEY as `0x${string}`);
export const liquidityOracleAccount = privateKeyToAccount(ENV.LIQUIDITY_ORACLE_PRIVATE_KEY as `0x${string}`);
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

export const regulatorWallet = createWalletClient({
  account: regulatorAccount,
  chain: foundry,
  transport: http(ENV.RPC_URL),
});

export const liquidityOracleWallet = createWalletClient({
  account: liquidityOracleAccount,
  chain: foundry,
  transport: http(ENV.RPC_URL),
});

const clients = { public: rpc as any, wallet: wallet as any };
const oracleClients = { public: rpc as any, wallet: oracleWallet as any };
const regulatorClients = { public: rpc as any, wallet: regulatorWallet as any };
const liquidityOracleClients = { public: rpc as any, wallet: liquidityOracleWallet as any };

// NAV contract
export const nav = getContract({
  address: ENV.NAV_REGISTRY_ADDRESS as `0x${string}`,
  abi: parseAbi([
    'function postNAV(bytes32 fundId, uint256 nav, uint64 asOf, bytes32 payloadHash) external',
    'function latestNAV(bytes32 fundId) view returns (uint256 nav, uint64 asOf, uint64 storedAt, int256 navAdjustmentBps, bytes32 payloadHash)',
    'function navAt(bytes32 fundId, uint256 index) view returns (uint256 nav, uint64 asOf, uint64 storedAt, int256 navAdjustmentBps, bytes32 payloadHash)',
    'function historyLength(bytes32 fundId) view returns (uint256)',
    'function postValuationHaircut(bytes32 fundId, uint16 valuationHaircutBps, uint64 occurredAt, bytes32 payloadHash) external',
    'function latestValuationHaircut(bytes32 fundId) view returns (uint16 valuationHaircutBps, uint64 occurredAt, uint64 submittedAt, bytes32 payloadHash, address submittedBy, bool exists)',
  ]),
  client: clients as any,
});

// Token contract
export const token = getContract({
  address: ENV.FUND_TOKEN_ADDRESS as `0x${string}`,
  abi: parseAbi([
    'function requestSubscription(uint256 amount) external returns (uint256 requestId)',
    'function requestSubscriptionFor(address investor, uint256 amount) external returns (uint256 requestId)',
    'function acceptSubscription(uint256 requestId) external',
    'function subscriptionRequestCount() view returns (uint256)',
    'function subscriptionRequestAt(uint256 requestId) view returns (address investor, uint256 amount, uint64 requestedAt, uint64 acceptedAt, bytes32 requestHash, bool accepted)',
    'function requestRedemptionFor(address investor, uint256 amount) external returns (uint256 requestId)',
    'function settleRedemption(uint256 requestId) external',
    'function flagSettlementDelayed(uint256 requestId, bytes32 reasonHash) external',
    'function balanceOf(address a) view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'function queuedRedemptionOf(address a) view returns (uint256)',
    'function totalQueuedRedemption() view returns (uint256)',
    'function redemptionQueueRatioBps() view returns (uint16)',
    'function redemptionRequestAt(uint256 requestId) view returns ((address investor, uint256 amount, uint64 requestedAt, uint64 settledAt, uint64 delayedAt, bytes32 delayReasonHash, bool settled, bool delayed) request)',
    'function setWhitelisted(address investor, bool eligible, bytes32 vcHash) external',
    'function whitelist(address investor) view returns (bool)',
  ]),
  client: clients as any,
});

const riskRegistryAbi = parseAbi([
    'function activeWeightsConfigId() view returns (uint64)',
    'function getWeightsConfig(uint64 weightsConfigId) view returns (uint16[6] weightBps, uint64 maxStaleAgeSec, bytes32 weightsHash, bool exists)',
    'function submitMetrics(bytes32 fundId, (uint16 valuationHaircutBps, uint16 redemptionPressureBps, uint16 redemptionQueueRatioBps, uint16 liquidityShortfallBps, uint16 stalePricingRiskBps, uint16 investorConcentrationBps) metrics, uint64 weightsConfigId, uint64 occurredAt, bytes32 payloadHash) returns (uint256 snapshotId)',
    'function computeRiskScoreBps((uint16 valuationHaircutBps, uint16 redemptionPressureBps, uint16 redemptionQueueRatioBps, uint16 liquidityShortfallBps, uint16 stalePricingRiskBps, uint16 investorConcentrationBps) metrics, uint64 weightsConfigId) view returns (uint16)',
    'function latestSnapshot(bytes32 fundId) view returns ((bytes32 fundId, (uint16 valuationHaircutBps, uint16 redemptionPressureBps, uint16 redemptionQueueRatioBps, uint16 liquidityShortfallBps, uint16 stalePricingRiskBps, uint16 investorConcentrationBps) metrics, uint16 riskScoreBps, uint16 kappaBps, uint64 weightsConfigId, uint64 occurredAt, uint64 submittedAt, bytes32 metricsHash, bytes32 payloadHash, address submittedBy) snapshot)',
    'function snapshotAt(bytes32 fundId, uint256 index) view returns ((bytes32 fundId, (uint16 valuationHaircutBps, uint16 redemptionPressureBps, uint16 redemptionQueueRatioBps, uint16 liquidityShortfallBps, uint16 stalePricingRiskBps, uint16 investorConcentrationBps) metrics, uint16 riskScoreBps, uint16 kappaBps, uint64 weightsConfigId, uint64 occurredAt, uint64 submittedAt, bytes32 metricsHash, bytes32 payloadHash, address submittedBy) snapshot)',
    'function historyLength(bytes32 fundId) view returns (uint256)',
    'function isGated(bytes32 fundId) view returns (bool)',
    'function effectiveKappaBps(bytes32 fundId) view returns (uint16)',
    'function releaseGate(bytes32 fundId, bytes32 reasonHash) external',
    'function submitLiquidityBuffer(bytes32 fundId, uint256 liquidityBufferRatioBps, uint64 occurredAt, bytes32 payloadHash) external',
    'function latestLiquidityBuffer(bytes32 fundId) view returns (uint256 liquidityBufferRatioBps, uint64 occurredAt, uint64 submittedAt, bytes32 payloadHash, address submittedBy, bool exists)',
    'function applySwingPricing(bytes32 fundId, uint16 adjustmentBps, bytes32 ruleId, uint64 occurredAt, bytes32 payloadHash) external',
    'function createSidePocket(bytes32 fundId, bytes32 assetCommitmentHash, bytes32 ruleId, uint64 occurredAt, bytes32 payloadHash) external',
    'function extendedControlState(bytes32 fundId) view returns (bool swingPricingActive, bool sidePocketActive, uint16 swingPricingAdjustmentBps, uint16 lastRiskScoreBps, bytes32 lastRuleId, bytes32 sidePocketAssetCommitmentHash)',
]);

// Risk submissions and regulatory releases use separate on-chain signers.
export const riskRegistry = getContract({
  address: ENV.RISK_REGISTRY_ADDRESS as `0x${string}`,
  abi: riskRegistryAbi,
  client: oracleClients as any,
});

export const regulatorRiskRegistry = getContract({
  address: ENV.RISK_REGISTRY_ADDRESS as `0x${string}`,
  abi: riskRegistryAbi,
  client: regulatorClients as any,
});

export const liquidityRiskRegistry = getContract({
  address: ENV.RISK_REGISTRY_ADDRESS as `0x${string}`,
  abi: riskRegistryAbi,
  client: liquidityOracleClients as any,
});

export const controlRiskRegistry = getContract({
  address: ENV.RISK_REGISTRY_ADDRESS as `0x${string}`,
  abi: riskRegistryAbi,
  client: clients as any,
});
