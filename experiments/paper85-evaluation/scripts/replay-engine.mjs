const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function address(value) {
  invariant(typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value), `invalid address ${value}`);
  return value.toLowerCase();
}

function uint(value, label) {
  const text = typeof value === 'bigint' ? value.toString() : String(value);
  invariant(/^(0|[1-9][0-9]*)$/.test(text), `${label}: invalid uint ${text}`);
  return BigInt(text);
}

function uintText(value, label) {
  return uint(value, label).toString();
}

function add(left, right) {
  return (BigInt(left) + BigInt(right)).toString();
}

function subtract(left, right, label) {
  const result = BigInt(left) - BigInt(right);
  invariant(result >= 0n, `${label}: uint underflow`);
  return result.toString();
}

function roleKey(contractName, role, account) {
  return `${contractName}:${String(role).toLowerCase()}:${address(account)}`;
}

function requestAt(requests, requestId, label) {
  const index = Number(uint(requestId, `${label}.requestId`));
  invariant(Number.isSafeInteger(index) && requests[index], `${label}: unknown request ${requestId}`);
  return requests[index];
}

export function createReplayState(genesis) {
  const actors = genesis.actors.map(address).sort();
  const balances = Object.fromEntries(actors.map((actor) => [actor, '0']));
  const whitelist = Object.fromEntries(actors.map((actor) => [actor, false]));
  const queuedRedemption = Object.fromEntries(actors.map((actor) => [actor, '0']));
  const roles = Object.fromEntries(
    genesis.roles.map((item) => [
      roleKey(item.contractName, item.role, item.account),
      item.enabled ?? true,
    ]),
  );
  return {
    fundId: genesis.fundId.toLowerCase(),
    totalSupply: '0',
    subscriptionRequestCount: '0',
    redemptionRequestCount: '0',
    totalQueuedRedemption: '0',
    balances,
    whitelist,
    queuedRedemption,
    paused: false,
    roles,
    navHistory: [],
    subscriptions: [],
    redemptions: [],
  };
}

function applyTransfer(state, args) {
  const from = address(args.from);
  const to = address(args.to);
  const value = uintText(args.value, 'Transfer.value');
  if (from === ZERO_ADDRESS) {
    state.totalSupply = add(state.totalSupply, value);
  } else {
    invariant(Object.hasOwn(state.balances, from), `Transfer: untracked sender ${from}`);
    state.balances[from] = subtract(state.balances[from], value, 'Transfer.senderBalance');
  }
  if (to === ZERO_ADDRESS) {
    state.totalSupply = subtract(state.totalSupply, value, 'Transfer.totalSupply');
  } else {
    invariant(Object.hasOwn(state.balances, to), `Transfer: untracked receiver ${to}`);
    state.balances[to] = add(state.balances[to], value);
  }
}

function applyShareBalanceCommitment(state, args) {
  const investor = address(args.investor);
  invariant(Object.hasOwn(state.balances, investor), `ShareBalanceUpdated: untracked investor ${investor}`);
  invariant(state.balances[investor] === uintText(args.balance, 'ShareBalanceUpdated.balance'), 'SHARE_BALANCE_COMMITMENT_MISMATCH');
  invariant(state.totalSupply === uintText(args.totalSupply, 'ShareBalanceUpdated.totalSupply'), 'TOTAL_SUPPLY_COMMITMENT_MISMATCH');
}

function applyNav(state, args) {
  invariant(String(args.fundId).toLowerCase() === state.fundId, 'NAV_FUND_ID_MISMATCH');
  const record = {
    nav: uintText(args.nav, 'NAVUpdatedEvent.nav'),
    netAssetValue: uintText(args.netAssetValue, 'NAVUpdatedEvent.netAssetValue'),
    totalSharesSnapshot: uintText(args.totalSharesSnapshot, 'NAVUpdatedEvent.totalSharesSnapshot'),
    asOf: uintText(args.asOf, 'NAVUpdatedEvent.asOf'),
    storedAt: uintText(args.storedAt, 'NAVUpdatedEvent.storedAt'),
    navAdjustmentBps: String(args.navAdjustmentBps),
    payloadHash: String(args.payloadHash).toLowerCase(),
    isInitial: Boolean(args.isInitial),
  };
  if (state.navHistory.length > 0) {
    invariant(BigInt(record.asOf) >= BigInt(state.navHistory.at(-1).asOf), 'REPLAY_NAV_TIME_REGRESSION');
  }
  state.navHistory.push(record);
}

function validateNavReference(state, eventName, requestId, navValue, navAsOf, context) {
  invariant(state.navHistory.length > 0, `${eventName}: no recoverable NAV`);
  const latest = state.navHistory.at(-1);
  const observedNav = uintText(navValue, `${eventName}.nav`);
  const observedAsOf = uintText(navAsOf, `${eventName}.navAsOf`);
  const valid = latest.nav === observedNav && latest.asOf === observedAsOf;
  return {
    eventName,
    requestId: uintText(requestId, `${eventName}.requestId`),
    blockNumber: context.blockNumber.toString(),
    transactionHash: context.transactionHash,
    latestRecoverableNavIndex: state.navHistory.length - 1,
    referencedNav: observedNav,
    referencedNavAsOf: observedAsOf,
    latestRecoverableNav: latest.nav,
    latestRecoverableNavAsOf: latest.asOf,
    valid,
  };
}

export function applyReplayEvent(state, event) {
  const { eventName, args, contractName } = event;
  const navReferences = [];
  if (eventName === 'InvestorWhitelisted') {
    const investor = address(args.investor);
    invariant(Object.hasOwn(state.whitelist, investor), `InvestorWhitelisted: untracked investor ${investor}`);
    state.whitelist[investor] = Boolean(args.eligible);
  } else if (eventName === 'SubscriptionRequested') {
    const requestId = uint(args.requestId, 'SubscriptionRequested.requestId');
    invariant(requestId === BigInt(state.subscriptions.length), 'SUBSCRIPTION_REQUEST_SEQUENCE_GAP');
    state.subscriptions.push({
      investor: address(args.investor),
      subscriptionAmount: uintText(args.subscriptionAmount, 'SubscriptionRequested.subscriptionAmount'),
      mintedShares: '0',
      navUsed: '0',
      navAsOf: '0',
      requestedAt: uintText(args.requestedAt, 'SubscriptionRequested.requestedAt'),
      acceptedAt: '0',
      requestHash: String(args.requestHash).toLowerCase(),
      accepted: false,
    });
    state.subscriptionRequestCount = state.subscriptions.length.toString();
  } else if (eventName === 'SubscriptionAccepted') {
    const request = requestAt(state.subscriptions, args.requestId, 'SubscriptionAccepted');
    invariant(!request.accepted, 'REPLAY_DUPLICATE_SUBSCRIPTION_ACCEPTANCE');
    invariant(request.investor === address(args.investor), 'SUBSCRIPTION_INVESTOR_MISMATCH');
    invariant(request.subscriptionAmount === uintText(args.subscriptionAmount, 'SubscriptionAccepted.subscriptionAmount'), 'SUBSCRIPTION_AMOUNT_MISMATCH');
    invariant(request.requestHash === String(args.requestHash).toLowerCase(), 'SUBSCRIPTION_HASH_MISMATCH');
    request.mintedShares = uintText(args.mintedShares, 'SubscriptionAccepted.mintedShares');
    request.navUsed = uintText(args.navUsed, 'SubscriptionAccepted.navUsed');
    request.navAsOf = uintText(args.navAsOf, 'SubscriptionAccepted.navAsOf');
    request.acceptedAt = uintText(args.acceptedAt, 'SubscriptionAccepted.acceptedAt');
    request.accepted = true;
    navReferences.push(validateNavReference(
      state,
      eventName,
      args.requestId,
      args.navUsed,
      args.navAsOf,
      event,
    ));
  } else if (eventName === 'Transfer') {
    applyTransfer(state, args);
  } else if (eventName === 'ShareBalanceUpdated') {
    applyShareBalanceCommitment(state, args);
  } else if (eventName === 'RedemptionRequested') {
    const requestId = uint(args.requestId, 'RedemptionRequested.requestId');
    invariant(requestId === BigInt(state.redemptions.length), 'REDEMPTION_REQUEST_SEQUENCE_GAP');
    const investor = address(args.investor);
    const redeemedShares = uintText(args.redeemedShares, 'RedemptionRequested.redeemedShares');
    state.redemptions.push({
      investor,
      redeemedShares,
      redemptionAmount: '0',
      settlementNav: '0',
      settlementNavAsOf: '0',
      requestedAt: uintText(args.requestedAt, 'RedemptionRequested.requestedAt'),
      settledAt: '0',
      delayedAt: '0',
      delayReasonHash: `0x${'0'.repeat(64)}`,
      settled: false,
      delayed: false,
    });
    state.redemptionRequestCount = state.redemptions.length.toString();
    state.queuedRedemption[investor] = add(state.queuedRedemption[investor], redeemedShares);
  } else if (eventName === 'RedemptionQueueUpdated') {
    invariant(state.totalSupply === uintText(args.totalSupply, 'RedemptionQueueUpdated.totalSupply'), 'QUEUE_SUPPLY_MISMATCH');
    state.totalQueuedRedemption = uintText(args.totalQueuedRedemption, 'RedemptionQueueUpdated.totalQueuedRedemption');
  } else if (eventName === 'SettlementDelayed') {
    const request = requestAt(state.redemptions, args.requestId, 'SettlementDelayed');
    invariant(!request.delayed && !request.settled, 'REPLAY_INVALID_SETTLEMENT_DELAY');
    request.delayed = true;
    request.delayedAt = uintText(args.delayedAt, 'SettlementDelayed.delayedAt');
    request.delayReasonHash = String(args.reasonHash).toLowerCase();
  } else if (eventName === 'RedemptionSettled') {
    const request = requestAt(state.redemptions, args.requestId, 'RedemptionSettled');
    invariant(!request.settled, 'REPLAY_DUPLICATE_REDEMPTION_SETTLEMENT');
    invariant(request.investor === address(args.investor), 'REDEMPTION_INVESTOR_MISMATCH');
    invariant(request.redeemedShares === uintText(args.redeemedShares, 'RedemptionSettled.redeemedShares'), 'REDEMPTION_SHARES_MISMATCH');
    request.redemptionAmount = uintText(args.redemptionAmount, 'RedemptionSettled.redemptionAmount');
    request.settlementNav = uintText(args.settlementNav, 'RedemptionSettled.settlementNav');
    request.settlementNavAsOf = uintText(args.settlementNavAsOf, 'RedemptionSettled.settlementNavAsOf');
    request.settledAt = uintText(args.settledAt, 'RedemptionSettled.settledAt');
    request.settled = true;
    state.queuedRedemption[request.investor] = subtract(
      state.queuedRedemption[request.investor],
      request.redeemedShares,
      'RedemptionSettled.queuedRedemption',
    );
    navReferences.push(validateNavReference(
      state,
      eventName,
      args.requestId,
      args.settlementNav,
      args.settlementNavAsOf,
      event,
    ));
  } else if (eventName === 'NAVUpdatedEvent') {
    applyNav(state, args);
  } else if (eventName === 'Paused') {
    invariant(!state.paused, 'REPLAY_DUPLICATE_PAUSE');
    state.paused = true;
  } else if (eventName === 'Unpaused') {
    invariant(state.paused, 'REPLAY_UNPAUSE_WHILE_ACTIVE');
    state.paused = false;
  } else if (eventName === 'RoleGranted') {
    state.roles[roleKey(contractName, args.role, args.account)] = true;
  } else if (eventName === 'RoleRevoked') {
    state.roles[roleKey(contractName, args.role, args.account)] = false;
  } else if (
    eventName === 'RiskGateConfigured'
    || eventName === 'Approval'
    || eventName === 'RoleAdminChanged'
    || eventName === 'ValuationHaircutEvent'
  ) {
    // Captured for audit completeness but outside the core replay projection.
  } else {
    throw new Error(`UNSUPPORTED_REPLAY_EVENT:${contractName}:${eventName}`);
  }
  return navReferences;
}

export function normalizedProjection(state) {
  return {
    totalSupply: state.totalSupply,
    subscriptionRequestCount: state.subscriptionRequestCount,
    redemptionRequestCount: state.redemptionRequestCount,
    totalQueuedRedemption: state.totalQueuedRedemption,
    balances: Object.fromEntries(Object.entries(state.balances).sort()),
    whitelist: Object.fromEntries(Object.entries(state.whitelist).sort()),
    queuedRedemption: Object.fromEntries(Object.entries(state.queuedRedemption).sort()),
    paused: state.paused,
    roles: Object.fromEntries(Object.entries(state.roles).sort()),
    navHistory: structuredClone(state.navHistory),
    subscriptions: structuredClone(state.subscriptions),
    redemptions: structuredClone(state.redemptions),
  };
}

export function finalizeNavReferences(state, references) {
  return references.map((reference) => {
    const record = state.navHistory[reference.latestRecoverableNavIndex];
    const recoverableAtEnd = Boolean(
      record
      && record.nav === reference.referencedNav
      && record.asOf === reference.referencedNavAsOf,
    );
    return {
      ...reference,
      validAtExecution: reference.valid,
      recoverableAtEnd,
      valid: reference.valid && recoverableAtEnd,
    };
  });
}

export function projectionEquals(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
