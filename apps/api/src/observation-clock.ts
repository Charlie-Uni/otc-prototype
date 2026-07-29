import { causalObservationTime } from './audit/time';
import { rpc } from './chain';

export function wallClockNowSec(): number {
  return Math.floor(Date.now() / 1_000);
}

export async function currentObservationTime(): Promise<number> {
  const latestBlock = await rpc.getBlock({ blockTag: 'latest' });
  return causalObservationTime(wallClockNowSec(), [Number(latestBlock.timestamp)]);
}
