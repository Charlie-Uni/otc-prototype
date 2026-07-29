import {
  decodeEventLog,
  type Address,
  type Hex,
} from 'viem';
import { RISK_REGISTRY_EVENT_ABI } from '../audit/lifecycle';

export type ReceiptLogForConfirmation = {
  address: Address;
  data: Hex;
  topics: [] | [Hex, ...Hex[]];
};

function sameHex(left: Hex, right: Hex): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

export function riskSnapshotIdFromReceipt(args: {
  receipt: { logs: readonly ReceiptLogForConfirmation[] };
  riskRegistryAddress: Address;
  fundId: Hex;
  payloadHash: Hex;
}): bigint {
  const matches: bigint[] = [];

  for (const log of args.receipt.logs) {
    if (!sameHex(log.address, args.riskRegistryAddress)) continue;
    try {
      const decoded = decodeEventLog({
        abi: RISK_REGISTRY_EVENT_ABI,
        data: log.data,
        topics: log.topics,
        strict: true,
      });
      if (
        decoded.eventName === 'RiskMetricsSubmitted'
        && sameHex(decoded.args.fundId, args.fundId)
        && sameHex(decoded.args.payloadHash, args.payloadHash)
      ) {
        matches.push(decoded.args.snapshotId);
      }
    } catch {
      // A successful submission receipt also contains unrelated contract events.
    }
  }

  if (matches.length === 0) throw new Error('RISK_SUBMISSION_EVENT_NOT_FOUND');
  if (matches.length > 1) throw new Error('RISK_SUBMISSION_EVENT_AMBIGUOUS');
  return matches[0];
}
