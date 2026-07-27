import Fastify from 'fastify';
import { ZodError } from 'zod';
import { ENV } from './env';
import health from './routes/health';
import kyc from './routes/kyc';
import nav from './routes/nav';
import token from './routes/token';
import risk from './routes/risk';
import audit from './routes/audit';
import liquidity from './routes/liquidity';
import controls from './routes/controls';
import { initializeDatabase } from './db/client';

// Global BigInt -> string fallback (harmless if already strings)
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = Fastify({ logger: true });

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: 'INVALID_REQUEST',
      issues: error.issues,
    });
  }
  return reply.send(error);
});

await initializeDatabase();

await app.register(health);
await app.register(kyc);
await app.register(nav);
await app.register(token);
await app.register(risk);
await app.register(liquidity);
await app.register(controls);
await app.register(audit);

app.listen({ port: ENV.PORT, host: '0.0.0.0' });
