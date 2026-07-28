import { parseAbi } from 'viem';
import {
  DisclosureAudience,
  TransparencyRegime,
  controlDisclosureAllowedFor,
  disclosureTimeFor,
} from '../risk/regimes';

export const FUND_TOKEN_EVENT_ABI = parseAbi([
  'event RiskGateConfigured(address indexed riskGate, bytes32 indexed fundId)',
  'event InvestorWhitelisted(address indexed investor, bool eligible, bytes32 indexed vcHash, address indexed by)',
  'event SubscriptionRequested(bytes32 indexed fundId, address indexed investor, uint256 indexed requestId, uint256 subscriptionAmount, uint64 requestedAt, bytes32 requestHash)',
  'event SubscriptionAccepted(bytes32 indexed fundId, address indexed investor, uint256 indexed requestId, uint256 subscriptionAmount, uint256 mintedShares, uint256 navUsed, uint64 navAsOf, uint64 requestedAt, uint64 acceptedAt, bytes32 requestHash)',
  'event ShareBalanceUpdated(address indexed investor, uint256 balance, uint256 totalSupply, bytes32 indexed reason)',
  'event RedemptionRequested(bytes32 indexed fundId, address indexed investor, uint256 indexed requestId, uint256 redeemedShares, uint64 requestedAt)',
  'event RedemptionQueueUpdated(bytes32 indexed fundId, uint256 totalQueuedRedemption, uint256 totalSupply, uint16 redemptionQueueRatioBps, uint64 updatedAt)',
  'event RedemptionSettled(bytes32 indexed fundId, address indexed investor, uint256 indexed requestId, uint256 redeemedShares, uint256 redemptionAmount, uint256 settlementNav, uint64 settlementNavAsOf, uint64 requestedAt, uint64 settledAt)',
  'event SettlementDelayed(bytes32 indexed fundId, address indexed investor, uint256 indexed requestId, uint256 redeemedShares, uint64 requestedAt, uint64 delayedAt, bytes32 reasonHash)',
]);

export const NAV_REGISTRY_EVENT_ABI = parseAbi([
  'event NAVUpdatedEvent(bytes32 indexed fundId, uint256 nav, uint256 netAssetValue, uint256 totalSharesSnapshot, uint64 asOf, uint64 storedAt, int256 navAdjustmentBps, bytes32 payloadHash, bool isInitial, address indexed by)',
  'event ValuationHaircutEvent(bytes32 indexed fundId, uint16 valuationHaircutBps, uint64 occurredAt, uint64 submittedAt, bytes32 payloadHash, address indexed submittedBy)',
]);

export const RISK_REGISTRY_EVENT_ABI = parseAbi([
  'event WeightsConfigSet(uint64 indexed weightsConfigId, uint64 maxStaleAgeSec, bytes32 weightsHash, address indexed by)',
  'event DefaultKappaUpdated(uint16 kappaBps, address indexed by)',
  'event FundKappaUpdated(bytes32 indexed fundId, uint16 kappaBps, address indexed by)',
  'event RiskMetricsSubmitted(bytes32 indexed fundId, uint256 indexed snapshotId, uint16 riskScoreBps, uint64 weightsConfigId, uint64 occurredAt, uint64 submittedAt, bytes32 metricsHash, bytes32 payloadHash, address indexed submittedBy)',
  'event StalePricingWarning(bytes32 indexed fundId, uint256 indexed snapshotId, uint16 stalePricingRiskBps, uint64 maxStaleAgeSec, bytes32 ruleId, uint64 occurredAt, uint64 submittedAt, bytes32 metricsHash)',
  'event LiquidityBufferUpdated(bytes32 indexed fundId, uint256 liquidityBufferRatioBps, uint64 occurredAt, uint64 submittedAt, bytes32 payloadHash, address indexed submittedBy)',
  'event RiskWarningEvent(bytes32 indexed fundId, uint256 indexed snapshotId, uint16 riskScoreBps, uint16 kappaBps, bytes32 ruleId, uint64 occurredAt, uint64 submittedAt, bytes32 metricsHash)',
  'event GateTriggered(bytes32 indexed fundId, uint256 indexed snapshotId, uint16 riskScoreBps, uint16 kappaBps, bytes32 ruleId, uint64 occurredAt, uint64 submittedAt, bytes32 metricsHash)',
  'event GateReleased(bytes32 indexed fundId, bytes32 reasonHash, uint64 submittedAt, address indexed by)',
  'event SwingPricingApplied(bytes32 indexed fundId, uint16 adjustmentBps, uint16 riskScoreBps, bytes32 ruleId, uint64 occurredAt, uint64 submittedAt, bytes32 payloadHash, address indexed by)',
  'event SidePocketCreated(bytes32 indexed fundId, bytes32 assetCommitmentHash, uint16 riskScoreBps, bytes32 ruleId, uint64 occurredAt, uint64 submittedAt, bytes32 payloadHash, address indexed by)',
]);

export type LifecycleContractName = 'FundToken' | 'NAVRegistry' | 'RiskRegistry';
export type LifecycleCategory =
  | 'eligibility'
  | 'subscription'
  | 'share_registry'
  | 'valuation'
  | 'liquidity'
  | 'redemption'
  | 'risk'
  | 'control'
  | 'governance';
export type LifecycleEvent = {
  eventId: string;
  chainId: number;
  contractAddress: `0x${string}`;
  contractName: LifecycleContractName;
  eventName: string;
  category: LifecycleCategory;
  fundId: `0x${string}`;
  transactionHash: `0x${string}`;
  logIndex: number;
  blockNumber: number;
  occurredAt: number;
  submittedAt: number;
  commitmentHash: `0x${string}`;
  payload: Record<string, unknown>;
};

export type NormalizeLifecycleEventInput = {
  chainId: number;
  contractAddress: `0x${string}`;
  contractName: LifecycleContractName;
  eventName: string;
  transactionHash: `0x${string}`;
  logIndex: number;
  blockNumber: number;
  blockTimestamp: number;
  commitmentHash: `0x${string}`;
  defaultFundId: `0x${string}`;
  args: Record<string, unknown>;
};

export type LifecycleTimelineEntry = LifecycleEvent & {
  regime: TransparencyRegime['id'];
  audience: DisclosureAudience;
  disclosedAt: number | null;
  observedAt: number;
  recordingLagSec: number;
  disclosureLagSec: number | null;
  observationLagSec: number;
};

const EVENT_CATEGORIES: Record<string, LifecycleCategory> = {
  InvestorWhitelisted: 'eligibility',
  SubscriptionRequested: 'subscription',
  SubscriptionAccepted: 'subscription',
  ShareBalanceUpdated: 'share_registry',
  NAVUpdatedEvent: 'valuation',
  ValuationHaircutEvent: 'valuation',
  StalePricingWarning: 'valuation',
  LiquidityBufferUpdated: 'liquidity',
  RedemptionRequested: 'redemption',
  RedemptionQueueUpdated: 'redemption',
  RedemptionSettled: 'redemption',
  SettlementDelayed: 'redemption',
  RiskMetricsSubmitted: 'risk',
  RiskWarningEvent: 'risk',
  GateTriggered: 'control',
  GateReleased: 'control',
  SwingPricingApplied: 'control',
  SidePocketCreated: 'control',
  RiskGateConfigured: 'governance',
  WeightsConfigSet: 'governance',
  DefaultKappaUpdated: 'governance',
  FundKappaUpdated: 'governance',
};

function integerArg(args: Record<string, unknown>, name: string): number | undefined {
  const value = args[name];
  if (typeof value !== 'number' && typeof value !== 'bigint') return undefined;
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new Error(`INVALID_${name.toUpperCase()}`);
  }
  return normalized;
}

function jsonValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, jsonValue(item)]),
    );
  }
  return value;
}

function occurredAtFor(eventName: string, args: Record<string, unknown>, blockTimestamp: number): number {
  const field = {
    SubscriptionRequested: 'requestedAt',
    SubscriptionAccepted: 'acceptedAt',
    NAVUpdatedEvent: 'asOf',
    ValuationHaircutEvent: 'occurredAt',
    StalePricingWarning: 'occurredAt',
    LiquidityBufferUpdated: 'occurredAt',
    RedemptionRequested: 'requestedAt',
    RedemptionQueueUpdated: 'updatedAt',
    RedemptionSettled: 'settledAt',
    SettlementDelayed: 'delayedAt',
    RiskMetricsSubmitted: 'occurredAt',
    RiskWarningEvent: 'occurredAt',
    GateTriggered: 'occurredAt',
    GateReleased: 'submittedAt',
    SwingPricingApplied: 'occurredAt',
    SidePocketCreated: 'occurredAt',
  }[eventName];
  return field ? integerArg(args, field) ?? blockTimestamp : blockTimestamp;
}

function submittedAtFor(eventName: string, args: Record<string, unknown>, blockTimestamp: number): number {
  if (eventName === 'NAVUpdatedEvent') return integerArg(args, 'storedAt') ?? blockTimestamp;
  return integerArg(args, 'submittedAt') ?? blockTimestamp;
}

export function normalizeLifecycleEvent(input: NormalizeLifecycleEventInput): LifecycleEvent {
  const category = EVENT_CATEGORIES[input.eventName];
  if (!category) throw new Error(`UNSUPPORTED_LIFECYCLE_EVENT:${input.eventName}`);
  if (!Number.isSafeInteger(input.blockTimestamp) || input.blockTimestamp < 0) {
    throw new Error('INVALID_BLOCK_TIMESTAMP');
  }

  const eventFundId = input.args.fundId;
  const normalizedFundId = typeof eventFundId === 'string' && /^0x[0-9a-fA-F]{64}$/.test(eventFundId)
    ? eventFundId as `0x${string}`
    : input.defaultFundId;

  return {
    eventId: `${input.chainId}:${input.transactionHash.toLowerCase()}:${input.logIndex}`,
    chainId: input.chainId,
    contractAddress: input.contractAddress,
    contractName: input.contractName,
    eventName: input.eventName,
    category,
    fundId: normalizedFundId,
    transactionHash: input.transactionHash,
    logIndex: input.logIndex,
    blockNumber: input.blockNumber,
    occurredAt: occurredAtFor(input.eventName, input.args, input.blockTimestamp),
    submittedAt: submittedAtFor(input.eventName, input.args, input.blockTimestamp),
    commitmentHash: input.commitmentHash,
    payload: jsonValue(input.args) as Record<string, unknown>,
  };
}

export function sortLifecycleEvents(events: readonly LifecycleEvent[]): LifecycleEvent[] {
  return [...events].sort((left, right) => (
    left.blockNumber - right.blockNumber || left.logIndex - right.logIndex
  ));
}

export function eventDisclosureTimeFor(
  event: LifecycleEvent,
  regime: TransparencyRegime,
  audience: DisclosureAudience,
): number | null {
  if (event.category === 'control') {
    const riskScoreRaw = event.payload.riskScoreBps;
    const riskScoreBps = typeof riskScoreRaw === 'number'
      ? riskScoreRaw
      : Number(riskScoreRaw ?? 0);
    const allowed = controlDisclosureAllowedFor(regime, {
      audience,
      currentGated: event.eventName === 'GateTriggered',
      riskScoreBps: Number.isFinite(riskScoreBps) ? riskScoreBps : 0,
      eventName: event.eventName,
    });
    if (!allowed) return null;
  }
  if (audience === 'regulator' && regime.visibility !== 'public') {
    return event.submittedAt;
  }
  return disclosureTimeFor(event.submittedAt, regime);
}

export function lifecycleTimelineEntry(
  event: LifecycleEvent,
  regime: TransparencyRegime,
  audience: DisclosureAudience,
  observedAt: number,
): LifecycleTimelineEntry {
  const disclosedAt = eventDisclosureTimeFor(event, regime, audience);
  return {
    ...event,
    regime: regime.id,
    audience,
    disclosedAt,
    observedAt,
    recordingLagSec: event.submittedAt - event.occurredAt,
    disclosureLagSec: disclosedAt === null ? null : disclosedAt - event.occurredAt,
    observationLagSec: observedAt - event.occurredAt,
  };
}
