import { FastifyInstance } from 'fastify';
import { exportAuditCsv } from '../audit/log';

export default async function (app: FastifyInstance) {
    app.get('/audit/export', async (_req, reply) => {
        const csv = await exportAuditCsv();
        reply.type('text/csv').send(csv);
    });
}
