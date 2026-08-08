const COMPONENTS = [
  ['O01', 'Qualification update: Alice'],
  ['O02', 'Qualification update: Bob'],
  ['O03', 'Initial NAV submission'],
  ['O04', 'Subscription request'],
  ['O05', 'Subscription acceptance'],
  ['O06', 'Restricted transfer'],
  ['O07', 'Formula NAV submission'],
  ['O08', 'Redemption request'],
  ['O09', 'Settlement delay flag'],
  ['O10', 'Redemption settlement'],
  ['O11', 'Pause'],
  ['O12', 'Resume'],
  ['O13', 'Role grant'],
  ['O14', 'Role revoke'],
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function stats(values) {
  invariant(values.length > 0, 'gas sample must not be empty');
  const samples = values.map(BigInt);
  const total = samples.reduce((sum, value) => sum + value, 0n);
  const sorted = [...samples].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return {
    samples: samples.length,
    averageGas: Number(total) / samples.length,
    minGas: Number(sorted[0]),
    maxGas: Number(sorted.at(-1)),
  };
}

function checkpointMap(run) {
  const entries = run.map((checkpoint) => [checkpoint.operationId, BigInt(checkpoint.gasUsed)]);
  const result = new Map(entries);
  invariant(result.size === COMPONENTS.length, `expected ${COMPONENTS.length} gas checkpoints, found ${result.size}`);
  for (const [operationId] of COMPONENTS) invariant(result.has(operationId), `missing gas checkpoint ${operationId}`);
  return result;
}

function sum(map, ...operationIds) {
  return operationIds.reduce((total, operationId) => total + map.get(operationId), 0n);
}

export function summarizeGasRuns(runs) {
  invariant(runs.length > 0, 'at least one gas run is required');
  const maps = runs.map(checkpointMap);
  const componentGas = Object.fromEntries(COMPONENTS.map(([operationId, label]) => [operationId, {
    label,
    transactionCountPerSample: 1,
    ...stats(maps.map((map) => map.get(operationId))),
  }]));

  const categories = {
    qualificationUpdate: {
      label: 'Qualification Update',
      transactionCountPerSample: 1,
      ...stats(maps.flatMap((map) => [map.get('O01'), map.get('O02')])),
    },
    navSubmission: {
      label: 'NAV Submission',
      transactionCountPerSample: 1,
      ...stats(maps.flatMap((map) => [map.get('O03'), map.get('O07')])),
    },
    subscription: {
      label: 'Subscription (request + acceptance)',
      transactionCountPerSample: 2,
      ...stats(maps.map((map) => sum(map, 'O04', 'O05'))),
    },
    redemption: {
      label: 'Redemption (request + settlement)',
      transactionCountPerSample: 2,
      ...stats(maps.map((map) => sum(map, 'O08', 'O10'))),
    },
    restrictedTransfer: {
      label: 'Restricted Transfer',
      transactionCountPerSample: 1,
      ...stats(maps.map((map) => map.get('O06'))),
    },
    pauseResume: {
      label: 'Pause / Resume',
      transactionCountPerSample: 1,
      ...stats(maps.flatMap((map) => [map.get('O11'), map.get('O12')])),
    },
    roleUpdate: {
      label: 'Role Update',
      transactionCountPerSample: 1,
      ...stats(maps.flatMap((map) => [map.get('O13'), map.get('O14')])),
    },
  };

  return {
    runCount: runs.length,
    methodology: {
      source: 'chapter3-artifact-v1.4.0 production contracts',
      environment: 'local deterministic Anvil EVM',
      categoryUnit: 'gas per lifecycle operation; multi-transaction categories are summed per run',
      excludes: 'deployment, bootstrap configuration, and feature-flagged experimental contracts',
    },
    categories,
    optionalComponents: {
      settlementDelay: componentGas.O09,
    },
    components: componentGas,
  };
}
