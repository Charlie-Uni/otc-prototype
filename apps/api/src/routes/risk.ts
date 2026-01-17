import { FastifyInstance } from 'fastify';
let status: 'green'|'yellow'|'red' = 'green';
export default async function (app: FastifyInstance) {
    app.get('/risk', async () => ({ status }));
    app.post('/risk/set/:s', async (req) => {
        // @ts-ignore
        status = req.params.s;
        return { status };
    });
}