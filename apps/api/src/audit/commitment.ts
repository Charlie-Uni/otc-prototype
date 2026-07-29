import { concatHex, keccak256, type Hex } from 'viem';

export function lifecycleLogCommitmentHash(topics: readonly Hex[], data: Hex): Hex {
  return keccak256(concatHex([...topics, data]));
}
