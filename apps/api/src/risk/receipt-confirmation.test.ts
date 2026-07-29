import assert from 'node:assert/strict';
import test from 'node:test';
import {
  encodeAbiParameters,
  encodeEventTopics,
  type Address,
  type Hex,
} from 'viem';
import { RISK_REGISTRY_EVENT_ABI } from '../audit/lifecycle';
import {
  riskSnapshotIdFromReceipt,
  type ReceiptLogForConfirmation,
} from './receipt-confirmation';

const REGISTRY = '0x1111111111111111111111111111111111111111' as const;
const OTHER_REGISTRY = '0x2222222222222222222222222222222222222222' as const;
const FUND_ID = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const OTHER_FUND_ID = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;
const PAYLOAD_HASH = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' as const;
const OTHER_PAYLOAD_HASH = '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd' as const;
const METRICS_HASH = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as const;
const SUBMITTER = '0x3333333333333333333333333333333333333333' as const;

function riskMetricsLog(args: {
  address?: Address;
  fundId?: Hex;
  snapshotId?: bigint;
  payloadHash?: Hex;
} = {}): ReceiptLogForConfirmation {
  return {
    address: args.address ?? REGISTRY,
    topics: encodeEventTopics({
      abi: RISK_REGISTRY_EVENT_ABI,
      eventName: 'RiskMetricsSubmitted',
      args: {
        fundId: args.fundId ?? FUND_ID,
        snapshotId: args.snapshotId ?? 7n,
        submittedBy: SUBMITTER,
      },
    }) as [Hex, ...Hex[]],
    data: encodeAbiParameters(
      [
        { type: 'uint16' },
        { type: 'uint64' },
        { type: 'uint64' },
        { type: 'uint64' },
        { type: 'bytes32' },
        { type: 'bytes32' },
      ],
      [7_100, 1n, 1_000n, 1_001n, METRICS_HASH, args.payloadHash ?? PAYLOAD_HASH],
    ),
  };
}

function gateTriggeredLog(): ReceiptLogForConfirmation {
  return {
    address: REGISTRY,
    topics: encodeEventTopics({
      abi: RISK_REGISTRY_EVENT_ABI,
      eventName: 'GateTriggered',
      args: { fundId: FUND_ID, snapshotId: 7n },
    }) as [Hex, ...Hex[]],
    data: encodeAbiParameters(
      [
        { type: 'uint16' },
        { type: 'uint16' },
        { type: 'bytes32' },
        { type: 'uint64' },
        { type: 'uint64' },
        { type: 'bytes32' },
      ],
      [7_100, 7_000, METRICS_HASH, 1_000n, 1_001n, METRICS_HASH],
    ),
  };
}

test('selects only the matching registry, fund and payload from a multi-log receipt', () => {
  const snapshotId = riskSnapshotIdFromReceipt({
    receipt: {
      logs: [
        gateTriggeredLog(),
        riskMetricsLog({ address: OTHER_REGISTRY, snapshotId: 2n }),
        riskMetricsLog({ fundId: OTHER_FUND_ID, snapshotId: 3n }),
        riskMetricsLog({ payloadHash: OTHER_PAYLOAD_HASH, snapshotId: 4n }),
        riskMetricsLog({ snapshotId: 9n }),
      ],
    },
    riskRegistryAddress: REGISTRY,
    fundId: FUND_ID,
    payloadHash: PAYLOAD_HASH,
  });

  assert.equal(snapshotId, 9n);
});

test('rejects receipts without exactly one matching risk submission event', () => {
  assert.throws(
    () => riskSnapshotIdFromReceipt({
      receipt: { logs: [gateTriggeredLog()] },
      riskRegistryAddress: REGISTRY,
      fundId: FUND_ID,
      payloadHash: PAYLOAD_HASH,
    }),
    /RISK_SUBMISSION_EVENT_NOT_FOUND/,
  );

  assert.throws(
    () => riskSnapshotIdFromReceipt({
      receipt: {
        logs: [
          riskMetricsLog({ snapshotId: 1n }),
          riskMetricsLog({ snapshotId: 2n }),
        ],
      },
      riskRegistryAddress: REGISTRY,
      fundId: FUND_ID,
      payloadHash: PAYLOAD_HASH,
    }),
    /RISK_SUBMISSION_EVENT_AMBIGUOUS/,
  );
});
