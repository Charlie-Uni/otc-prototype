// Case-policy audit, NOT a general regulatory-compliance determination.
// Policy classifies regular dealing NAVs and historical corrections separately.
// storedAt is a simulated computation/approval time, not independent evidence
// of the institution's actual computation time. asOf alone is insufficient.
export function auditPricing(state, references, policy) {
  const corrections = new Set(policy.correctionIndices);
  const regular = state.navHistory.map((nav, index) => ({ ...nav, index }))
    .filter((nav) => !corrections.has(nav.index));
  return references.map((ref) => {
    const subscription = ref.eventName === 'SubscriptionAccepted';
    const request = (subscription ? state.subscriptions : state.redemptions)[Number(ref.requestId)];
    const processedAt = Number(subscription ? request.acceptedAt : request.settledAt);
    // Orders received during suspension are queued for the first regular NAV
    // at/after resumption, according to this explicit stylized dealing policy.
    const suspension = policy.suspensions.find((s) => Number(request.requestedAt) >= s.from && Number(request.requestedAt) < s.resume);
    const next = regular.find((nav) => Number(nav.storedAt) > Number(request.requestedAt)
      && (!suspension || Number(nav.storedAt) >= suspension.resume));
    const observedIndex = ref.latestRecoverableNavIndex;
    const pass = Boolean(next && observedIndex === next.index && Number(next.storedAt) <= processedAt);
    return { type: subscription ? 'subscription' : 'redemption', requestId: Number(ref.requestId),
      investor: request.investor, requestedAt: Number(request.requestedAt), processedAt,
      navAsOf: Number(ref.referencedNavAsOf), observedNavIndex: observedIndex,
      nextApplicableNavIndex: next?.index ?? null, nextComputedAt: next ? Number(next.storedAt) : null,
      originalAsOfProxy: Number(ref.referencedNavAsOf) > Number(request.requestedAt),
      nextApplicableNavMatches: pass,
      reason: pass ? 'next-applicable-NAV' : !next ? 'no-next-regular-NAV-in-record' : observedIndex < next.index ? 'priced-before-next-NAV' : 'skipped-next-NAV' };
  });
}
