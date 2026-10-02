// Temporary release qualification only. Never part of the final function artifact.
import {verifySafetyAlertDestination, sendSafetyAlert, safetyAlertRecipient, safetyAlertSender} from '../../supabase/functions/_shared/safety-removal-cloudflare.ts';
import {renderDojiEmail} from '../../supabase/functions/_shared/doji-email.ts';

type ProbeEnv = {
  serviceKeys: string[];
  enabled: string;
  accountId: string;
  token: string;
  expiresAt: number;
};
const reference = 'a8e75b6b-ea0a-4371-a729-b3e3bed102ef';
const subject = 'Doji · Dedicated safety email connection TEST';

async function equalSecret(actual: string, expected: string): Promise<boolean> {
  if (!actual || !expected) return false;
  const digest = (value: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const [a, b] = await Promise.all([digest(actual), digest(expected)]);
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

export async function safetyEmailRuntimeProbe(request: Request, env: ProbeEnv, upstream: typeof fetch = fetch, now = Date.now()): Promise<Response> {
  const reply = (status: number, value: object) => Response.json(value, {status, headers: {'cache-control': 'no-store'}});
  if (!Number.isFinite(env.expiresAt) || now >= env.expiresAt || env.expiresAt - now > 20 * 60_000) return reply(410, {message: 'Verification closed'});
  const provided = request.headers.get('apikey') ?? '';
  if (provided.length > 4096 || !(await Promise.all(env.serviceKeys.filter(Boolean).map(key => equalSecret(provided, key)))).some(Boolean)) return reply(401, {message: 'Unauthorized'});
  if (request.method !== 'POST') return reply(405, {message: 'POST required'});
  if (env.enabled !== 'false') return reply(409, {message: 'Disabled dispatcher required'});
  const action = new URL(request.url).pathname.split('/').pop();
  if (action !== 'verify' && action !== 'canary') return reply(404, {message: 'Not found'});
  // No caller-supplied recipient, case, content or reference is accepted.
  if (request.body) {
    const reader = request.body.getReader();
    const first = await reader.read();
    await reader.cancel();
    if (!first.done) return reply(400, {message: 'Empty request required'});
  }
  try {
    const config = {accountId: env.accountId, token: env.token};
    if (!await verifySafetyAlertDestination(config, upstream)) return reply(503, {message: 'Verified destination unavailable'});
    if (action === 'verify') return reply(200, {verifiedDestination: true, dispatcherEnabled: false});
    const email = renderDojiEmail({preheader: 'Test only — no removal request or member action.', eyebrow: 'Connection verification · TEST', title: 'Safety email connection test', summary: 'This verifies the dedicated Cloudflare credential from Supabase. No removal request was submitted and no member action was taken. Public intake and production alerts remain disabled.', tone: 'info', reference, footerNote: 'One authorized release test. No requester or member information is included.'});
    // Exercise the exact production adapter, changing only the clearly labelled subject.
    const labelledFetch: typeof fetch = (input, init) => {
      const body = JSON.parse(String(init?.body));
      return upstream(input, {...init, body: JSON.stringify({...body, subject})});
    };
    const outcome = await sendSafetyAlert(config, {reference, from: safetyAlertSender, to: safetyAlertRecipient, ...email}, labelledFetch);
    return reply(outcome.providerId ? 200 : 503, {reference, ...outcome});
  } catch {
    return reply(503, {message: 'Verification incomplete; do not automatically resend'});
  }
}
