// Owner explicitly requested ONE additional branded approval email on October 12.
// Manual presentation proof, not an outbox replay or production rollout.
// No database writes, gate/counter resets, or automatic retry.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { cli, hash } from './prepare-safety-launch.mts';
import { evidenceRecord as record, evidenceRows as rows } from './release-evidence.mts';
import { prepareBusinessMail } from '../infra/business-email/message.mts';
const root = 'test-results/business-branded-resend-20261012';
const recipient = 'faheygs+doji-business-test@gmail.com';
const app = '9af16915-3c97-484e-ab93-69f58a464608';
const original = 'be89b5ae-cd7a-4915-bae1-bc7fd4801cfc';
const capacityObserved = '2026-10-12T12:09:29Z';
assert.ok(Date.now() - Date.parse(capacityObserved) < 1800000, 'Refresh capacity evidence');
await mkdir(root, { recursive: true });
await assert.rejects(access(`${root}/started.json`), 'Already attempted; reconcile, never resend automatically');
const cfg = record(JSON.parse(await readFile('.artifacts/business-onboarding-release-20261011/mail.json', 'utf8')));
assert.equal(cfg.allowedRecipient, recipient);
assert.equal(cfg.clientId, 'client_01M3T51363MDZZK6X8DB7NS32N');
assert.match(String(cfg.resendKey), /^re_[A-Za-z0-9_-]{10,}$/);
assert.match(String(cfg.from), /^[A-Za-z0-9._+-]+@mail\.dojipro\.com$/);
const query = (sql: string) => rows(cli(['db', 'query', sql, '--linked', '--workdir', 'D:/ChallengeApp/DoIt', '--output-format', 'json']));
const q = query(`begin read only;set local statement_timeout='3s';
 select q.id,q.application_id,q.kind,q.status,q.provider_id,a.state,a.revision,
 i.subject,r.issuer,r.audience,e.sending_enabled,e.capture_enabled,s.enabled wakeup
 from business_private.email_outbox q join business_private.applications a on a.id=q.application_id
 join business_private.accounts b on b.id=a.applicant_id and not b.disabled
 join portal_identity_private.principals p on p.id=b.id and p.realm='business' and p.state='active'
 join portal_identity_private.identities i on i.principal_id=p.id and i.realm='business' and not i.revoked
 join portal_identity_private.realms r on r.realm=i.realm and r.enabled
 cross join business_private.email_settings e cross join business_private.email_sender_settings s
 where q.id='${original}' and a.id='${app}';rollback;`)[0];
assert.ok(q);assert.equal(q.state, 'approved');assert.equal(q.status, 'accepted');assert.equal(q.kind, 'approve');
assert.equal(q.provider_id, '01a12e25-cbcc-7501-9768-7095280afdf2');
for (const key of ['sending_enabled', 'capture_enabled', 'wakeup']) assert.equal(q[key], false);
assert.equal(q.audience, cfg.clientId);assert.equal(q.issuer, `https://api.workos.com/user_management/${cfg.clientId}`);
assert.match(String(q.subject), /^user_[A-Za-z0-9]+$/);
const userResponse = await fetch(`https://api.workos.com/user_management/users/${q.subject}`, { headers: { authorization: `Bearer ${cfg.workosKey}` }, redirect: 'error', signal: AbortSignal.timeout(10000) });
assert.equal(userResponse.status, 200);const user = record(await userResponse.json());
assert.equal(user.email, recipient);assert.equal(user.email_verified, true);
const mail = prepareBusinessMail({ id: original, application_id: app, kind: 'approve', subject: String(q.subject), issuer: String(q.issuer), audience: String(q.audience) }, user, { issuer: String(q.issuer), audience: String(q.audience) }, { setupEnabled: true });
assert.equal(mail.to, recipient);assert.match(mail.html, />Finish setup<\/a>/);
const key = 'owner-requested-branded-business-resend/20261012/' + original;
await writeFile(`${root}/started.json`, JSON.stringify({ at: new Date().toISOString(), recipient, application: app, originalProviderId: q.provider_id, originalOutboxId: original, idempotencyKey: key, htmlHash: hash(mail.html), capacity: { observedAt: capacityObserved, plan: 'Free', monthlyUsed: 6, monthlyLimit: 3000, dailyUsed: 1, dailyLimit: 100, paidOverages: false }, authority: 'Owner: Just resend the email', maximumAdditionalEmails: 1, productionChanges: false }, null, 2), { flag: 'wx' });
try {
 const sent = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${cfg.resendKey}`, 'content-type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ from: `Doji for Business <${cfg.from}>`, to: [recipient], subject: mail.subject, html: mail.html, text: mail.text }), redirect: 'error', signal: AbortSignal.timeout(15000) });
 const value: unknown = await sent.json();const result = record(value);
 const accepted = sent.ok && typeof result.id === 'string' && /^[a-f0-9-]{36}$/i.test(result.id);
 const receipt = { at: new Date().toISOString(), status: sent.status, state: accepted ? 'accepted' : 'unconfirmed', providerId: accepted ? result.id : null };
 await writeFile(`${root}/receipt.json`, JSON.stringify(receipt, null, 2), { flag: 'wx' });
 console.log(JSON.stringify(receipt));assert.ok(accepted, 'Stop and reconcile; no retry');
} catch {
 await writeFile(`${root}/reconcile-required.json`, JSON.stringify({ at: new Date().toISOString(), noAutomaticRetry: true }), { flag: 'wx' });
 throw Error('Email outcome requires reconciliation; do not send again.');
}
