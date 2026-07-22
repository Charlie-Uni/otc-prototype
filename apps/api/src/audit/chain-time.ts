import { rpc } from '../chain';

export async function waitForTransactionTimestamp(transactionHash: `0x${string}`): Promise<number> {
  const receipt = await rpc.waitForTransactionReceipt({ hash: transactionHash });
  const block = await rpc.getBlock({ blockNumber: receipt.blockNumber });
  return Number(block.timestamp);
}
