import { decodeEventLog, parseAbi } from 'viem';
import { fundId, rpc } from '../chain';
import { ENV } from '../env';
import { ControlTransition, sortControlTransitions } from './control-state';

const CONTROL_EVENT_ABI = parseAbi([
  'event GateTriggered(bytes32 indexed fundId, uint256 indexed snapshotId, uint16 riskScoreBps, uint16 kappaBps, bytes32 ruleId, uint64 occurredAt, uint64 submittedAt, bytes32 metricsHash)',
  'event GateReleased(bytes32 indexed fundId, bytes32 reasonHash, uint64 submittedAt, address indexed by)',
]);

export async function readControlTransitions(): Promise<ControlTransition[]> {
  // Filter to the two control events server-side (by topic) and start from the
  // configured deployment block so public views do not trigger unbounded
  // full-chain scans as history grows.
  const logs = await rpc.getLogs({
    address: ENV.RISK_REGISTRY_ADDRESS as `0x${string}`,
    events: CONTROL_EVENT_ABI,
    fromBlock: BigInt(ENV.CHAIN_LOG_START_BLOCK),
    toBlock: 'latest',
  });
  const transitions: ControlTransition[] = [];

  for (const log of logs) {
    if (log.blockNumber === null || log.transactionHash === null || log.logIndex === null) continue;
    let decoded: ReturnType<typeof decodeEventLog>;
    try {
      decoded = decodeEventLog({
        abi: CONTROL_EVENT_ABI,
        data: log.data,
        topics: log.topics,
        strict: true,
      });
    } catch {
      continue;
    }

    const args = (decoded.args ?? {}) as Record<string, unknown>;
    if (args.fundId !== fundId) continue;
    const submittedAt = Number(args.submittedAt);
    const isTriggered = decoded.eventName === 'GateTriggered';
    transitions.push({
      eventName: isTriggered ? 'GateTriggered' : 'GateReleased',
      gated: isTriggered,
      occurredAt: isTriggered ? Number(args.occurredAt) : submittedAt,
      submittedAt,
      transactionHash: log.transactionHash,
      blockNumber: Number(log.blockNumber),
      logIndex: log.logIndex,
    });
  }

  return sortControlTransitions(transitions);
}
