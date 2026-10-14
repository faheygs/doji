// Local protected configuration only. Does not deploy, enable, or call a provider.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createBusinessRecoveryEmail } from '../infra/portal-identity/business-owned-recovery-email.mts';
import { evidenceArray, evidenceRecord } from './release-evidence.mts';
import { hash } from './prepare-safety-launch.mts';

assert.equal(process.argv.length, 2);
const secure = '.artifacts/business-recovery-acceptance-20261011';
const evidence = 'test-results/business-recovery-acceptance-20261011';
const target = `${secure}/runtime-staged.json`;
await assert.rejects(access(target), 'Existing keys must be retained, not regenerated');
execFileSync('git', ['check-ignore', target], { stdio: 'pipe' });
const baseline = evidenceRecord(JSON.parse(await readFile(`${evidence}/baseline.json`, 'utf8')));
const previousText = await readFile(`${secure}/runtime-before.json`, 'utf8');
assert.equal(
  hash(previousText),
  evidenceArray(baseline.secrets).find((s) => s.name === 'BUSINESS_V2_CONFIG')?.value,
);
const previous = evidenceRecord(JSON.parse(previousText));
assert.equal(previous.realm, 'business');
assert.equal(previous.origin, 'https://business.dojipro.com');
assert.equal(previous.clientId, 'client_01M3T51363MDZZK6X8DB7NS32N');
assert.equal(previous.ownedAuth, undefined);
const apiKey = (await readFile(`${secure}/business-mail-key.txt`, 'utf8')).trim();
const webhookSecret = (await readFile(`${secure}/reset-webhook-secret.txt`, 'utf8')).trim();
assert.match(apiKey, /^re_[A-Za-z0-9_-]{20,}$/);
assert.ok(webhookSecret.length >= 20);
const recoveryEmail = {
  enabled: false,
  workosDefaultEmailDisabled: false,
  trackingDisabled: false,
  capacityApprovedUntil: 0,
  apiKey,
  from: 'Doji for Business <accounts@mail.dojipro.com>',
};
const ownedAuth = {
  enabled: false,
  sendingEnabled: false,
  acceptanceOnly: true,
  admissionHmacKey: randomBytes(32).toString('hex'),
  operationHmacKey: randomBytes(32).toString('hex'),
  webhookSecret,
  recoveryEmail,
};
assert.equal(
  new Set([ownedAuth.admissionHmacKey, ownedAuth.operationHmacKey, previous.encryptionKey]).size,
  3,
);
assert.notEqual(webhookSecret, previous.actionSecret);
assert.notEqual(webhookSecret, previous.apiKey);
let calls = 0;
const delivery = createBusinessRecoveryEmail(recoveryEmail, async () => {
  calls++;
  throw Error('Unexpected provider request');
});
assert.throws(() => delivery.assertReady(new AbortController().signal));
assert.equal(calls, 0);
// The existing legacy signup setting is unchanged while owned mode is disabled.
// Before acceptance enablement, signupEnabled must be false and exact-alias SQL
// admission/enrollment bounds must be qualified separately.
await writeFile(target, JSON.stringify({ ...previous, ownedAuth }), { flag: 'wx', mode: 0o600 });
const saved = evidenceRecord(JSON.parse(await readFile(target, 'utf8')));
const { ownedAuth: stagedOwned, ...preserved } = saved;
assert.deepEqual(preserved, previous);
assert.deepEqual(stagedOwned, ownedAuth);
await writeFile(
  `${evidence}/mail-config-staged.json`,
  JSON.stringify(
    {
      at: new Date().toISOString(),
      configHash: hash(await readFile(target)),
      from: recoveryEmail.from,
      ownedMode: false,
      sending: false,
      providerCalls: calls,
      existingConfigurationPreserved: true,
      deployed: false,
    },
    null,
    2,
  ),
  { flag: 'wx' },
);
console.log(
  'Protected business mail configuration prepared; all sending gates closed; no provider calls.',
);
