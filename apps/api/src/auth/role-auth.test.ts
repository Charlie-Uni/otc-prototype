import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { API_ROLES, ApiRoleKeys, auditActorFor, createRoleGuard, resolveApiRole } from './role-auth';

const roleKeys = Object.fromEntries(
  API_ROLES.map((role) => [role, `test-${role}-api-key`]),
) as ApiRoleKeys;

test('resolves every API key to exactly one configured role', () => {
  for (const role of API_ROLES) {
    assert.equal(resolveApiRole(roleKeys[role], roleKeys), role);
  }
  assert.equal(resolveApiRole('unknown-api-key', roleKeys), null);
});

test('rejects duplicate API keys because role resolution would be ambiguous', () => {
  assert.throws(
    () => createRoleGuard({ ...roleKeys, auditor: roleKeys.regulator }),
    /DUPLICATE_API_ROLE_KEY/,
  );
});

test('role guard enforces authentication and authorization boundaries', async () => {
  const app = Fastify();
  const requireAnyRole = createRoleGuard(roleKeys);
  app.get(
    '/regulator-only',
    { preHandler: requireAnyRole('regulator') },
    async (request) => ({ ok: true, actor: auditActorFor(request) }),
  );

  const missing = await app.inject({ method: 'GET', url: '/regulator-only' });
  assert.equal(missing.statusCode, 401);
  assert.deepEqual(missing.json(), { error: 'AUTHENTICATION_REQUIRED' });

  const invalid = await app.inject({
    method: 'GET',
    url: '/regulator-only',
    headers: { 'x-api-key': 'invalid-api-key' },
  });
  assert.equal(invalid.statusCode, 401);
  assert.deepEqual(invalid.json(), { error: 'INVALID_API_KEY' });

  const forbidden = await app.inject({
    method: 'GET',
    url: '/regulator-only',
    headers: { 'x-api-key': roleKeys.investor },
  });
  assert.equal(forbidden.statusCode, 403);
  assert.deepEqual(forbidden.json(), { error: 'FORBIDDEN', requiredRoles: ['regulator'] });

  const allowed = await app.inject({
    method: 'GET',
    url: '/regulator-only',
    headers: { 'x-api-key': roleKeys.regulator },
  });
  assert.equal(allowed.statusCode, 200);
  assert.deepEqual(allowed.json(), { ok: true, actor: 'api:regulator' });

  await app.close();
});
