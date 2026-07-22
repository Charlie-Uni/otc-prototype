import { FastifyInstance } from 'fastify';
import { ACCESS_POLICY, requireAnyRole } from '../auth';
import { exportAuditCsv } from '../audit/log';

export default async function (app: FastifyInstance) {
    app.get('/audit/export', { preHandler: requireAnyRole(...ACCESS_POLICY.auditRead) }, async (_req, reply) => {
        const csv = await exportAuditCsv();
        reply.type('text/csv').send(csv);
    });
}
