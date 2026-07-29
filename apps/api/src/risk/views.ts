import { recordAudit } from '../audit/log';
import { fundId } from '../chain';
import {
  readCurrentGateState,
  readLatestRiskSnapshot,
  readRiskHistoryLength,
  readRiskSnapshotAt,
} from './chain-readers';
import {
  disclosedControlState,
  latestControlTransition,
  latestDisclosedControlTransition,
} from './control-state';
import { readControlTransitions } from './controls';
import { searchLatestDisclosedSnapshot } from './disclosure-search';
import {
  buildPublicRiskPayload,
  buildRegulatorRiskPayload,
  buildUnavailablePublicRiskPayload,
  buildUnavailableRegulatorRiskPayload,
  getTransparencyRegime,
  regulatorUsesDisclosureBoundary,
  type TransparencyRegime,
  type TransparencyRegimeId,
} from './regimes';

function nowSec(): number {
  return Math.floor(Date.now() / 1_000);
}

async function findLatestDisclosedSnapshot(
  regime: TransparencyRegime,
  observedAt: number,
) {
  return searchLatestDisclosedSnapshot(
    readRiskSnapshotAt,
    await readRiskHistoryLength(),
    regime,
    observedAt,
  );
}

function requireDisclosureTime(disclosedAt: number | null): number {
  if (disclosedAt === null) {
    throw new Error('DISCLOSURE_TIME_MISSING');
  }
  return disclosedAt;
}

export async function buildPublicRiskView(
  regimeId: TransparencyRegimeId,
  actor: string,
) {
  const regime = getTransparencyRegime(regimeId);
  const observedAt = nowSec();
  const { snapshot, disclosedAt, nextDisclosedAt } =
    await findLatestDisclosedSnapshot(regime, observedAt);

  if (!snapshot) {
    await recordAudit({
      actor,
      action: 'risk.public.observe',
      observedAt,
      details: {
        fundId,
        regime: regime.id,
        transparency: regime,
        available: false,
        notYetDisclosed: nextDisclosedAt !== null,
      },
    });
    return buildUnavailablePublicRiskPayload({
      regime,
      notYetDisclosed: nextDisclosedAt !== null,
      observedAt,
    });
  }

  const [transitions, currentGated] = await Promise.all([
    readControlTransitions(),
    readCurrentGateState(),
  ]);
  const usesDisclosureBoundary = regime.visibility === 'public';
  const latestVisibleControl = usesDisclosureBoundary
    ? latestDisclosedControlTransition(transitions, regime, observedAt)
    : latestControlTransition(transitions);
  const visibleGated = usesDisclosureBoundary
    ? disclosedControlState(transitions, regime, observedAt)
    : currentGated;
  const visibleAt = requireDisclosureTime(disclosedAt);

  await recordAudit({
    actor,
    action: 'risk.public.observe',
    occurredAt: snapshot.occurredAt,
    submittedAt: snapshot.submittedAt,
    disclosedAt: visibleAt,
    observedAt,
    details: {
      fundId,
      regime: regime.id,
      transparency: regime,
      payloadHash: snapshot.payloadHash,
      available: true,
    },
  });

  return buildPublicRiskPayload({
    regime,
    snapshot,
    observedAt,
    disclosedAt: visibleAt,
    visibleGated,
    latestVisibleControlEventName: latestVisibleControl?.eventName ?? null,
  });
}

export async function buildRegulatorRiskView(
  regimeId: TransparencyRegimeId,
  actor: string,
) {
  const regime = getTransparencyRegime(regimeId);
  const observedAt = nowSec();

  if (regulatorUsesDisclosureBoundary(regime)) {
    const { snapshot, disclosedAt, nextDisclosedAt } =
      await findLatestDisclosedSnapshot(regime, observedAt);
    if (!snapshot) {
      await recordAudit({
        actor,
        action: 'risk.regulator.observe',
        observedAt,
        details: {
          fundId,
          regime: regime.id,
          transparency: regime,
          available: false,
          notYetDisclosed: nextDisclosedAt !== null,
        },
      });
      return buildUnavailableRegulatorRiskPayload({
        fundId,
        regime,
        observedAt,
        notYetDisclosed: nextDisclosedAt !== null,
      });
    }

    const visibleAt = requireDisclosureTime(disclosedAt);
    const transitions = await readControlTransitions();
    const visibleGated = disclosedControlState(transitions, regime, observedAt);
    await recordAudit({
      actor,
      action: 'risk.regulator.observe',
      occurredAt: snapshot.occurredAt,
      submittedAt: snapshot.submittedAt,
      disclosedAt: visibleAt,
      observedAt,
      details: {
        fundId,
        regime: regime.id,
        transparency: regime,
        payloadHash: snapshot.payloadHash,
        available: true,
      },
    });

    return buildRegulatorRiskPayload({
      fundId,
      regime,
      snapshot,
      observedAt,
      disclosedAt: visibleAt,
      visibleGated,
    });
  }

  const [snapshot, gated] = await Promise.all([
    readLatestRiskSnapshot(),
    readCurrentGateState(),
  ]);
  if (!snapshot) {
    await recordAudit({
      actor,
      action: 'risk.regulator.observe',
      observedAt,
      details: {
        fundId,
        regime: regime.id,
        transparency: regime,
        available: false,
      },
    });
    return buildUnavailableRegulatorRiskPayload({
      fundId,
      regime,
      observedAt,
      notYetDisclosed: false,
    });
  }

  await recordAudit({
    actor,
    action: 'risk.regulator.observe',
    occurredAt: snapshot.occurredAt,
    submittedAt: snapshot.submittedAt,
    disclosedAt: snapshot.submittedAt,
    observedAt,
    details: {
      fundId,
      regime: regime.id,
      transparency: regime,
      payloadHash: snapshot.payloadHash,
      available: true,
    },
  });

  return buildRegulatorRiskPayload({
    fundId,
    regime,
    snapshot,
    observedAt,
    disclosedAt: snapshot.submittedAt,
    visibleGated: gated,
  });
}
