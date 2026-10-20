// Post-hoc probe (NOT part of the v3 pre-registration). Written after the
// case run to check a code-reading observation used in Section 5.6: the
// production transfer path checks only the receiver's eligibility, so a holder
// whose eligibility was revoked can still transfer shares to an eligible
// investor, while a redemption request by the same holder is rejected.
import { resolve } from 'node:path';
import { E18, RESULTS_DIR, account, artifact, deploy, gitHead, mustWrite, startAnvil, toolVersions, tryWrite, viem, writeJson } from './common.mjs';

const { keccak256, stringToHex } = viem;
const h = (x) => keccak256(stringToHex(x));
const env = await startAnvil(18950, { accounts: 4 });
try {
  const [admin, , holder, receiver] = [0, 1, 2, 3].map(account);
  const w = (a) => env.walletFor(a);
  const nav = await deploy({ client: env.client, wallet: w(admin), art: await artifact('NAVRegistry'), args: [admin.address] });
  const fund = await deploy({ client: env.client, wallet: w(admin), art: await artifact('FundToken'), args: [admin.address, 'Probe', 'PRB', h('PROBE_FUND'), nav.address] });
  const risk = await deploy({ client: env.client, wallet: w(admin), art: await artifact('RiskRegistry'), args: [admin.address, [1667, 1667, 1667, 1667, 1666, 1666], 2_592_000, 7000] });
  const call = (contract, fn, args, who = admin) => mustWrite({ client: env.client, wallet: w(who), contract, functionName: fn, args });
  await call(fund, 'setRiskGate', [risk.address]);
  await call(fund, 'grantRole', [h('SUBSCRIPTION_ROLE'), admin.address]);
  await call(fund, 'setWhitelisted', [holder.address, true, h('CDD-holder')]);
  await call(fund, 'setWhitelisted', [receiver.address, true, h('CDD-receiver')]);
  const block = await env.client.getBlock();
  await call(nav, 'postInitialNAV', [h('PROBE_FUND'), E18, block.timestamp, h('NAV-0')]);
  await call(fund, 'requestSubscription', [100n * E18], holder);
  await call(fund, 'acceptSubscription', [0n]);
  await call(fund, 'setWhitelisted', [holder.address, false, h('CDD-holder-revoked')]);
  const transfer = await tryWrite({ client: env.client, wallet: w(holder), contract: fund, functionName: 'transfer', args: [receiver.address, 10n * E18] });
  const redemption = await tryWrite({ client: env.client, wallet: w(holder), contract: fund, functionName: 'requestRedemption', args: [10n * E18] });
  const result = {
    experiment: 'paper85-v3-posthoc-revoked-holder-transfer',
    preregistered: false,
    provenance: { ...(await gitHead()), tools: toolVersions(), runAt: new Date().toISOString() },
    revokedHolderTransferToEligible: transfer.status === 'accepted' ? 'accepted' : `rejected:${transfer.reason}`,
    revokedHolderRedemptionRequest: redemption.status === 'accepted' ? 'accepted' : `rejected:${redemption.reason}`,
  };
  await writeJson(resolve(RESULTS_DIR, 'D-posthoc-revoked-transfer.json'), result);
  console.log(JSON.stringify(result, null, 1));
} finally {
  await env.stop();
}
