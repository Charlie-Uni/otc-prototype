import { getAddress, parseAbiItem, zeroAddress } from 'viem';
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

const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

function normalizeAddress(address: Address): Address {
  return getAddress(address) as Address;
}

function applyDelta(balances: Map<Address, bigint>, holder: Address, delta: bigint) {
  const current = balances.get(holder) ?? 0n;
  const next = current + delta;
  if (next < 0n) {
    throw new Error('NEGATIVE_HOLDER_BALANCE');
  }
  if (next === 0n) {
    balances.delete(holder);
    return;
  }
  balances.set(holder, next);
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

export async function readHolderShareSnapshot(): Promise<HolderShareSnapshot> {
  const [{ ENV }, { rpc }] = await Promise.all([
    import('../env'),
    import('../chain'),
  ]);
  const balances = new Map<Address, bigint>();
  const logs = await rpc.getLogs({
    address: ENV.FUND_TOKEN_ADDRESS as Address,
    event: transferEvent,
    fromBlock: 0n,
    toBlock: 'latest',
  });

  for (const log of logs) {
    const from = normalizeAddress(log.args.from as Address);
    const to = normalizeAddress(log.args.to as Address);
    const value = log.args.value as bigint;

    if (from !== zeroAddress) {
      applyDelta(balances, from, -value);
    }
    if (to !== zeroAddress) {
      applyDelta(balances, to, value);
    }
  }

  const holderBalances = Array.from(balances.entries()).map(([holder, balance]) => ({ holder, balance }));
  const holderSharesBps = balancesToHolderSharesBps(holderBalances);
  const totalSupply = holderBalances.reduce((sum, entry) => sum + entry.balance, 0n);

  return {
    holderSharesBps,
    holderCount: holderBalances.length,
    totalSupply: totalSupply.toString(),
  };
}
