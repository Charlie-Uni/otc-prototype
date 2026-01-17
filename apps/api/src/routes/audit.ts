import { FastifyInstance } from 'fastify';
export default async function (app: FastifyInstance) {
    app.get('/audit/export', async (_req, reply) => {
        // For demo, return a CSV string (replace with DB+chain aggregation)
        const csv = 'type,ts,details\nNAV,1710000000,{"nav":123456789}\nSUB,1710001000,{"amount":1000000000000000000}'
        reply.type('text/csv').send(csv);
    });
}