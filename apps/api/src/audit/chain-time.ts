import { rpc } from '../chain';

export async function waitForTransaction(transactionHash: `0x${string}`) {
  const receipt = await rpc.waitForTransactionReceipt({ hash: transactionHash });
  const block = await rpc.getBlock({ blockNumber: receipt.blockNumber });
  return { receipt, submittedAt: Number(block.timestamp) };
}

export async function waitForTransactionTimestamp(transactionHash: `0x${string}`): Promise<number> {
  return (await waitForTransaction(transactionHash)).submittedAt;
}
