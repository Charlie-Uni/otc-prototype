import { createHash, timingSafeEqual } from 'node:crypto';
import { FastifyReply, FastifyRequest } from 'fastify';

export const API_ROLES = [
  'investor',
  'manager',
  'registrar',
  'nav_oracle',
  'liquidity_oracle',
  'risk_oracle',
  'regulator',
  'auditor',
] as const;

export type ApiRole = typeof API_ROLES[number];
export type ApiRoleKeys = Record<ApiRole, string>;

function secureEqual(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left).digest();
  const rightDigest = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function assertUniqueRoleKeys(roleKeys: ApiRoleKeys): void {
  const keys = Object.values(roleKeys);
  if (new Set(keys).size !== keys.length) {
    throw new Error('DUPLICATE_API_ROLE_KEY');
  }
}

export function resolveApiRole(apiKey: string, roleKeys: ApiRoleKeys): ApiRole | null {
  for (const role of API_ROLES) {
    if (secureEqual(apiKey, roleKeys[role])) {
      return role;
    }
  }
  return null;
}

export function createRoleGuard(roleKeys: ApiRoleKeys) {
  assertUniqueRoleKeys(roleKeys);

  return (...allowedRoles: readonly ApiRole[]) => {
    if (allowedRoles.length === 0) {
      throw new Error('EMPTY_ALLOWED_ROLES');
    }

    return async function roleGuard(request: FastifyRequest, reply: FastifyReply) {
      const header = request.headers['x-api-key'];
      const apiKey = Array.isArray(header) ? header[0] : header;
      if (!apiKey) {
        return reply
          .header('www-authenticate', 'ApiKey')
          .code(401)
          .send({ error: 'AUTHENTICATION_REQUIRED' });
      }

      const role = resolveApiRole(apiKey, roleKeys);
      if (!role) {
        return reply
          .header('www-authenticate', 'ApiKey')
          .code(401)
          .send({ error: 'INVALID_API_KEY' });
      }

      if (!allowedRoles.includes(role)) {
        return reply.code(403).send({
          error: 'FORBIDDEN',
          requiredRoles: allowedRoles,
        });
      }
    };
  };
}
