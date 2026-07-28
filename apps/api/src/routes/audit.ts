import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { exportLifecycleCsv } from '../audit/export';
import { listLifecycleEvents, syncLifecycleEvents } from '../audit/indexer';
import {
    LifecycleCategory,
    lifecycleTimelineEntry,
} from '../audit/lifecycle';
import { exportAuditCsv, recordAudit } from '../audit/log';
import { ACCESS_POLICY, auditActorFor, requireAnyRole } from '../auth';
import { ENV } from '../env';
import { DisclosureAudience, TRANSPARENCY_REGIME_IDS, getTransparencyRegime } from '../risk/regimes';
import { MAX_BPS } from '../risk/calc';
import { analyzeDetectionLags } from '../simulation/detection';
import {
    CHAPTER3_KAPPA_BPS_VALUES,
    CHAPTER3_MAX_STALE_AGE_DAYS,
    CHAPTER3_WEIGHT_SCHEMES,
    runRiskSensitivity,
} from '../simulation/sensitivity';

const TimelineQuerySchema = z.object({
    regime: z.enum(TRANSPARENCY_REGIME_IDS).default(ENV.DEFAULT_TRANSPARENCY_REGIME),
    audience: z.enum(['public', 'regulator']).default('regulator'),
    category: z.enum([
        'eligibility',
        'subscription',
        'share_registry',
        'valuation',
        'liquidity',
        'redemption',
        'risk',
        'control',
        'governance',
    ]).optional(),
    eventName: z.string().min(1).optional(),
    limit: z.coerce.number().int().positive().max(10_000).default(1_000),
});
const bpsSchema = z.coerce.number().int().min(0).max(MAX_BPS);
const DetectionScenarioSchema = z.object({
    scenarioId: z.string().min(1),
    fundId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    shockAt: z.coerce.number().int().positive(),
    detectionThresholdBps: bpsSchema,
    observationStartAt: z.coerce.number().int().positive().optional(),
    pollingIntervalSec: z.coerce.number().int().positive(),
});
const SensitivitySchema = z.object({
    valuationHaircutBps: bpsSchema,
    redemptionPressureBps: bpsSchema,
    redemptionQueueRatioBps: bpsSchema,
    liquidityShortfallBps: bpsSchema,
    investorConcentrationBps: bpsSchema,
    staleAgeDaysRaw: z.coerce.number().int().min(0),
    detectionThresholdBps: bpsSchema.default(6_000),
    kappaBpsValues: z.array(bpsSchema)
        .min(1)
        .max(16)
        .refine((values) => new Set(values).size === values.length, 'Duplicate kappa values are not allowed')
        .default([...CHAPTER3_KAPPA_BPS_VALUES]),
});

function nowSec(): number {
    return Math.floor(Date.now() / 1_000);
}

async function readTimeline(rawQuery: unknown) {
    const parsed = TimelineQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
        throw Object.assign(new Error('INVALID_AUDIT_QUERY'), { statusCode: 400 });
    }
    const query = parsed.data;
    const observedAt = nowSec();
    const regime = getTransparencyRegime(query.regime);
    const allEvents = await listLifecycleEvents(10_000);
    const selected = allEvents
        .filter((event) => query.category === undefined || event.category === query.category as LifecycleCategory)
        .filter((event) => query.eventName === undefined || event.eventName === query.eventName)
        .slice(0, query.limit);
    const entries = selected.map((event) => lifecycleTimelineEntry(
        event,
        regime,
        query.audience as DisclosureAudience,
        observedAt,
    ));
    return { query, observedAt, entries };
}

export default async function (app: FastifyInstance) {
    app.post('/audit/sync', { preHandler: requireAnyRole(...ACCESS_POLICY.auditSync) }, async (req) => {
        const result = await syncLifecycleEvents();
        await recordAudit({
            actor: auditActorFor(req),
            action: 'audit.lifecycle.sync',
            details: result,
        });
        return result;
    });

    app.get('/audit/events', { preHandler: requireAnyRole(...ACCESS_POLICY.auditRead) }, async (req) => {
        const { entries, observedAt, query } = await readTimeline(req.query);
        await recordAudit({
            actor: auditActorFor(req),
            action: 'audit.lifecycle.read',
            observedAt,
            details: { regime: query.regime, audience: query.audience, count: entries.length },
        });
        return { observedAt, count: entries.length, events: entries };
    });

    app.get('/audit/lifecycle.csv', { preHandler: requireAnyRole(...ACCESS_POLICY.auditRead) }, async (req, reply) => {
        const { entries, observedAt, query } = await readTimeline(req.query);
        await recordAudit({
            actor: auditActorFor(req),
            action: 'audit.lifecycle.export',
            observedAt,
            details: { format: 'csv', regime: query.regime, audience: query.audience, count: entries.length },
        });
        reply.type('text/csv').send(exportLifecycleCsv(entries));
    });

    app.get('/audit/simulation', { preHandler: requireAnyRole(...ACCESS_POLICY.auditRead) }, async (req) => {
        const { entries, observedAt, query } = await readTimeline(req.query);
        await recordAudit({
            actor: auditActorFor(req),
            action: 'audit.simulation.export',
            observedAt,
            details: { regime: query.regime, audience: query.audience, count: entries.length },
        });
        return {
            observedAt,
            regime: query.regime,
            audience: query.audience,
            methodology: {
                detectionLagDefinition: 'three_measure_model',
                system: 'first qualifying RiskMetricsSubmitted.submittedAt - shockAt',
                disclosure: 'qualifying event disclosedAt(regime,audience) - shockAt',
                observation: 'first scheduled observedAt at or after disclosedAt - shockAt',
                dedicatedEndpoint: '/audit/detection-lags',
            },
            events: entries,
        };
    });

    app.post('/audit/detection-lags', { preHandler: requireAnyRole(...ACCESS_POLICY.auditRead) }, async (req) => {
        const body = DetectionScenarioSchema.parse(req.body);
        const scenario = {
            ...body,
            fundId: body.fundId as `0x${string}`,
            observationStartAt: body.observationStartAt ?? body.shockAt,
        };
        const analysis = analyzeDetectionLags(await listLifecycleEvents(10_000), scenario);
        await recordAudit({
            actor: auditActorFor(req),
            action: 'audit.detection_lags.analyze',
            occurredAt: scenario.shockAt,
            observedAt: nowSec(),
            details: {
                scenarioId: scenario.scenarioId,
                fundId: scenario.fundId,
                detectionThresholdBps: scenario.detectionThresholdBps,
                pollingIntervalSec: scenario.pollingIntervalSec,
                anchorEventId: analysis.anchor.eventId,
            },
        });
        return analysis;
    });

    app.post('/audit/sensitivity', { preHandler: requireAnyRole(...ACCESS_POLICY.auditRead) }, async (req) => {
        const body = SensitivitySchema.parse(req.body);
        const rows = runRiskSensitivity({
            metricsWithoutStale: {
                valuationHaircutBps: body.valuationHaircutBps,
                redemptionPressureBps: body.redemptionPressureBps,
                redemptionQueueRatioBps: body.redemptionQueueRatioBps,
                liquidityShortfallBps: body.liquidityShortfallBps,
                investorConcentrationBps: body.investorConcentrationBps,
            },
            staleAgeSecRaw: body.staleAgeDaysRaw * 24 * 60 * 60,
            maxStaleAgeDays: CHAPTER3_MAX_STALE_AGE_DAYS,
            weightSchemes: CHAPTER3_WEIGHT_SCHEMES,
            detectionThresholdBps: body.detectionThresholdBps,
            kappaBpsValues: body.kappaBpsValues,
        });
        await recordAudit({
            actor: auditActorFor(req),
            action: 'audit.risk_sensitivity.analyze',
            details: {
                staleAgeDaysRaw: body.staleAgeDaysRaw,
                detectionThresholdBps: body.detectionThresholdBps,
                kappaBpsValues: body.kappaBpsValues,
                rowCount: rows.length,
            },
        });
        return {
            parameters: {
                maxStaleAgeDays: CHAPTER3_MAX_STALE_AGE_DAYS,
                weightSchemes: CHAPTER3_WEIGHT_SCHEMES,
                staleAgeDaysRaw: body.staleAgeDaysRaw,
                detectionThresholdBps: body.detectionThresholdBps,
                kappaBpsValues: body.kappaBpsValues,
            },
            rows,
        };
    });

    app.get('/audit/export', { preHandler: requireAnyRole(...ACCESS_POLICY.auditRead) }, async (req, reply) => {
        const csv = await exportAuditCsv();
        await recordAudit({
            actor: auditActorFor(req),
            action: 'audit.api.export',
            details: { format: 'csv' },
        });
        reply.type('text/csv').send(csv);
    });
}
