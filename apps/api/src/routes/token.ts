import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { token } from '../chain';


export default async function (app: FastifyInstance) {
    app.post('/token/subscribe', async (req) => {
        const body = z.object({ to: z.string(), amount: z.string() }).parse(req.body);
        const tx = await token.write.mint([body.to as `0x${string}`, BigInt(body.amount)]);
        return { tx };
    });


    app.post('/token/redeem', async (req) => {
        const body = z.object({ from: z.string(), amount: z.string() }).parse(req.body);
        const tx = await token.write.burnFrom([body.from as `0x${string}`, BigInt(body.amount)]);
        return { tx };
    });


    app.get('/token/balance/:addr', async (req) => {
        // @ts-ignore
        const { addr } = req.params;
        const bal = await token.read.balanceOf([addr as `0x${string}`]);
        return { balance: bal.toString() };
    });
}