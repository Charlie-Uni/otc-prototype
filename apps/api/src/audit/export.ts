import { LifecycleTimelineEntry } from './lifecycle';
import { csvEscape } from './retention';

export function exportLifecycleCsv(entries: readonly LifecycleTimelineEntry[]): string {
  return [
    [
      'eventId',
      'contractName',
      'eventName',
      'category',
      'fundId',
      'transactionHash',
      'blockNumber',
      'logIndex',
      'occurredAt',
      'submittedAt',
      'disclosedAt',
      'observedAt',
      'recordingLagSec',
      'disclosureLagSec',
      'observationLagSec',
      'regime',
      'audience',
      'commitmentHash',
      'payload',
    ].join(','),
    ...entries.map((entry) => [
      entry.eventId,
      entry.contractName,
      entry.eventName,
      entry.category,
      entry.fundId,
      entry.transactionHash,
      entry.blockNumber,
      entry.logIndex,
      entry.occurredAt,
      entry.submittedAt,
      entry.disclosedAt,
      entry.observedAt,
      entry.recordingLagSec,
      entry.disclosureLagSec,
      entry.observationLagSec,
      entry.regime,
      entry.audience,
      entry.commitmentHash,
      entry.payload,
    ].map(csvEscape).join(',')),
  ].join('\n');
}
