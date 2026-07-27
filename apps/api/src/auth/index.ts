import { ENV } from '../env';
import { ApiRoleKeys, createRoleGuard } from './role-auth';

export const ACCESS_POLICY = {
  kycWrite: ['registrar'],
  kycRead: ['registrar', 'regulator', 'auditor'],
  navWrite: ['manager', 'nav_oracle'],
  navRead: ['manager', 'nav_oracle', 'regulator', 'auditor'],
  subscriptionWrite: ['manager', 'registrar'],
  subscriptionRead: ['manager', 'registrar', 'regulator', 'auditor'],
  liquidityWrite: ['liquidity_oracle'],
  liquidityRead: ['manager', 'liquidity_oracle', 'regulator', 'auditor'],
  extendedControlWrite: ['manager'],
  redemptionWrite: ['manager'],
  redemptionRead: ['manager', 'regulator', 'auditor'],
  holderBalanceRead: ['investor', 'manager', 'registrar', 'regulator', 'auditor'],
  riskSubmit: ['risk_oracle'],
  gateRelease: ['regulator'],
  regulatorRiskRead: ['regulator'],
  auditRead: ['regulator', 'auditor'],
  auditSync: ['regulator', 'auditor'],
} as const;

const roleKeys: ApiRoleKeys = {
  investor: ENV.API_KEY_INVESTOR,
  manager: ENV.API_KEY_MANAGER,
  registrar: ENV.API_KEY_REGISTRAR,
  nav_oracle: ENV.API_KEY_NAV_ORACLE,
  liquidity_oracle: ENV.API_KEY_LIQUIDITY_ORACLE,
  risk_oracle: ENV.API_KEY_RISK_ORACLE,
  regulator: ENV.API_KEY_REGULATOR,
  auditor: ENV.API_KEY_AUDITOR,
};

export const requireAnyRole = createRoleGuard(roleKeys);

export { auditActorFor } from './role-auth';
