import { getAddress, parseAbiItem } from 'viem';
import { MAX_BPS } from './calc';

type Address = `0x${string}`;

export type HolderShareSnapshot = {
  holderSharesBps: number[];
  holderCount: number;
  totalSupply: string;
};

export type HolderBalance = {
  holder: Address;
  balance: bigint;
};

const shareBalanceUpdatedEvent = parseAbiItem(
  'event ShareBalanceUpdated(address indexed investor, uint256 balance, uint256 totalSupply, bytes32 indexed reason)',
);

function normalizeAddress(address: Address): Address {
  return getAddress(address) as Address;
}

function setBalance(balances: Map<Address, bigint>, holder: Address, balance: bigint) {
  if (balance === 0n) {
    balances.delete(holder);
    return;
  }
  balances.set(holder, balance);
}

export function balancesToHolderSharesBps(holderBalances: HolderBalance[]): number[] {
  const positiveBalances = holderBalances
    .filter((entry) => entry.balance > 0n)
    .sort((a, b) => a.holder.localeCompare(b.holder));

  const totalSupply = positiveBalances.reduce((sum, entry) => sum + entry.balance, 0n);
  if (totalSupply === 0n) {
    throw new Error('NO_HOLDERS');
  }

  const allocations = positiveBalances.map((entry, index) => {
    const numerator = entry.balance * BigInt(MAX_BPS);
    return {
      index,
      bps: Number(numerator / totalSupply),
      remainder: numerator % totalSupply,
    };
  });

  let allocated = allocations.reduce((sum, entry) => sum + entry.bps, 0);
  let remaining = MAX_BPS - allocated;

  allocations
    .slice()
    .sort((a, b) => {
      if (a.remainder === b.remainder) return a.index - b.index;
      return a.remainder > b.remainder ? -1 : 1;
    })
    .forEach((entry) => {
      if (remaining <= 0) return;
      allocations[entry.index].bps += 1;
      allocated += 1;
      remaining -= 1;
    });

  if (allocated !== MAX_BPS) {
    throw new Error('HOLDER_SHARES_ALLOCATION_FAILED');
  }

  return allocations.map((entry) => entry.bps);
}

export function assertHolderRegistryMatchesTotalSupply(
  holderBalances: HolderBalance[],
  expectedTotalSupply: bigint,
): bigint {
  const reconstructedTotalSupply = holderBalances.reduce((sum, entry) => sum + entry.balance, 0n);
  if (reconstructedTotalSupply !== expectedTotalSupply) {
    throw new Error('HOLDER_REGISTRY_TOTAL_SUPPLY_MISMATCH');
  }
  return reconstructedTotalSupply;
}

export async function readHolderShareSnapshot(blockNumber: bigint): Promise<HolderShareSnapshot> {
  const [{ ENV }, { rpc, token }] = await Promise.all([
    import('../env'),
    import('../chain'),
  ]);
  const balances = new Map<Address, bigint>();
  const [logs, chainTotalSupply] = await Promise.all([
    rpc.getLogs({
      address: ENV.FUND_TOKEN_ADDRESS as Address,
      event: shareBalanceUpdatedEvent,
      fromBlock: 0n,
      toBlock: blockNumber,
    }),
    token.read.totalSupply({ blockNumber }),
  ]);

  let latestEventTotalSupply: bigint | null = null;
  for (const log of logs) {
    const investor = normalizeAddress(log.args.investor as Address);
    const balance = log.args.balance as bigint;
    latestEventTotalSupply = log.args.totalSupply as bigint;
    setBalance(balances, investor, balance);
  }

  const holderBalances = Array.from(balances.entries()).map(([holder, balance]) => ({ holder, balance }));
  const holderSharesBps = balancesToHolderSharesBps(holderBalances);
  const eventTotalSupply = latestEventTotalSupply ?? 0n;
  const totalSupply = assertHolderRegistryMatchesTotalSupply(
    holderBalances,
    eventTotalSupply,
  );
  if (eventTotalSupply !== chainTotalSupply) {
    throw new Error('HOLDER_EVENT_CHAIN_TOTAL_SUPPLY_MISMATCH');
  }

  return {
    holderSharesBps,
    holderCount: holderBalances.length,
    totalSupply: totalSupply.toString(),
  };
}
