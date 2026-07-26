import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { exportLifecycleCsv } from '../audit/export';
import { listLifecycleEvents, syncLifecycleEvents } from '../audit/indexer';
import {
    DisclosureAudience,
    LifecycleCategory,
    lifecycleTimelineEntry,
} from '../audit/lifecycle';
import { exportAuditCsv, recordAudit } from '../audit/log';
import { ACCESS_POLICY, auditActorFor, requireAnyRole } from '../auth';
import { ENV } from '../env';
import { TRANSPARENCY_REGIME_IDS, getTransparencyRegime } from '../risk/regimes';

const TimelineQuerySchema = z.object({
    regime: z.enum(TRANSPARENCY_REGIME_IDS).default(ENV.DEFAULT_TRANSPARENCY_REGIME),
    audience: z.enum(['public', 'regulator']).default('regulator'),
    category: z.enum([
        'eligibility',
        'share_registry',
        'valuation',
        'redemption',
        'risk',
        'control',
        'governance',
    ]).optional(),
    eventName: z.string().min(1).optional(),
    limit: z.coerce.number().int().positive().max(10_000).default(1_000),
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
                detectionLagDefinition: 'not_assigned',
                reason: 'The artifact exports raw timestamp dimensions; the thesis must select T_Detected explicitly.',
                availableCandidates: ['recordingLagSec', 'disclosureLagSec', 'observationLagSec'],
            },
            events: entries,
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
