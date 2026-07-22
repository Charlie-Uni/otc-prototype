import { parseAbi } from 'viem';
import { TransparencyRegime, disclosureTimeFor } from '../risk/regimes';

export const FUND_TOKEN_EVENT_ABI = parseAbi([
  'event RiskGateConfigured(address indexed riskGate, bytes32 indexed fundId)',
  'event InvestorWhitelisted(address indexed investor, bool eligible, bytes32 indexed vcHash, address indexed by)',
  'event ShareBalanceUpdated(address indexed investor, uint256 balance, uint256 totalSupply, bytes32 indexed reason)',
  'event RedemptionRequested(bytes32 indexed fundId, address indexed investor, uint256 indexed requestId, uint256 amount, uint64 requestedAt)',
  'event RedemptionQueueUpdated(bytes32 indexed fundId, uint256 totalQueuedRedemption, uint256 totalSupply, uint16 redemptionQueueRatioBps, uint64 updatedAt)',
  'event RedemptionSettled(bytes32 indexed fundId, address indexed investor, uint256 indexed requestId, uint256 amount, uint64 requestedAt, uint64 settledAt)',
  'event SettlementDelayed(bytes32 indexed fundId, address indexed investor, uint256 indexed requestId, uint256 amount, uint64 requestedAt, uint64 observedAt, bytes32 reasonHash)',
]);

export const NAV_REGISTRY_EVENT_ABI = parseAbi([
  'event NavPosted(uint256 nav, uint256 asOf, uint256 storedAt, address indexed by)',
]);

export const RISK_REGISTRY_EVENT_ABI = parseAbi([
  'event WeightsConfigSet(uint64 indexed weightsConfigId, uint64 maxStaleAgeSec, bytes32 weightsHash, address indexed by)',
  'event DefaultKappaUpdated(uint16 kappaBps, address indexed by)',
  'event FundKappaUpdated(bytes32 indexed fundId, uint16 kappaBps, address indexed by)',
  'event RiskMetricsSubmitted(bytes32 indexed fundId, uint256 indexed snapshotId, uint16 riskScoreBps, uint64 weightsConfigId, uint64 occurredAt, uint64 submittedAt, bytes32 metricsHash, bytes32 payloadHash, address indexed submittedBy)',
  'event RiskWarningEvent(bytes32 indexed fundId, uint256 indexed snapshotId, uint16 riskScoreBps, uint16 kappaBps, bytes32 ruleId, uint64 occurredAt, uint64 submittedAt, bytes32 metricsHash)',
  'event GateTriggered(bytes32 indexed fundId, uint256 indexed snapshotId, uint16 riskScoreBps, uint16 kappaBps, bytes32 ruleId, uint64 occurredAt, uint64 submittedAt, bytes32 metricsHash)',
  'event GateReleased(bytes32 indexed fundId, bytes32 reasonHash, uint64 submittedAt, address indexed by)',
]);

export type LifecycleContractName = 'FundToken' | 'NAVRegistry' | 'RiskRegistry';
export type LifecycleCategory =
  | 'eligibility'
  | 'share_registry'
  | 'valuation'
  | 'redemption'
  | 'risk'
  | 'control'
  | 'governance';
export type DisclosureAudience = 'public' | 'regulator';

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
  ShareBalanceUpdated: 'share_registry',
  NavPosted: 'valuation',
  RedemptionRequested: 'redemption',
  RedemptionQueueUpdated: 'redemption',
  RedemptionSettled: 'redemption',
  SettlementDelayed: 'redemption',
  RiskMetricsSubmitted: 'risk',
  RiskWarningEvent: 'risk',
  GateTriggered: 'control',
  GateReleased: 'control',
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
    NavPosted: 'asOf',
    RedemptionRequested: 'requestedAt',
    RedemptionQueueUpdated: 'updatedAt',
    RedemptionSettled: 'settledAt',
    SettlementDelayed: 'observedAt',
    RiskMetricsSubmitted: 'occurredAt',
    RiskWarningEvent: 'occurredAt',
    GateTriggered: 'occurredAt',
    GateReleased: 'submittedAt',
  }[eventName];
  return field ? integerArg(args, field) ?? blockTimestamp : blockTimestamp;
}

function submittedAtFor(eventName: string, args: Record<string, unknown>, blockTimestamp: number): number {
  if (eventName === 'NavPosted') return integerArg(args, 'storedAt') ?? blockTimestamp;
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
  if (audience === 'regulator' && regime.visibility !== 'public') {
    return event.submittedAt;
  }
  if (audience === 'public' && event.category === 'control' && regime.controlDisclosure === 'private') {
    return null;
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
