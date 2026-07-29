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
import { validateChainConfiguration } from './chain';
import { initializeDatabase } from './db/client';
import { classifyHttpError } from './http/errors';

// Global BigInt -> string fallback (harmless if values are already strings).
Object.defineProperty(BigInt.prototype, 'toJSON', {
  configurable: true,
  value(this: bigint) {
    return this.toString();
  },
});

const app = Fastify({ logger: true });

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: 'INVALID_REQUEST',
      issues: error.issues,
    });
  }
  const classified = classifyHttpError(error);
  return reply.code(classified.statusCode).send({ error: classified.code });
});

await initializeDatabase();
await validateChainConfiguration();

await app.register(health);
await app.register(kyc);
await app.register(nav);
await app.register(token);
await app.register(risk);
await app.register(liquidity);
await app.register(controls);
await app.register(audit);

app.listen({ port: ENV.PORT, host: '0.0.0.0' });
