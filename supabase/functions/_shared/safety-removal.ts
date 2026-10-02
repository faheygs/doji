import { readJsonBody } from './json-body.ts';
import { employeeServiceHeaders } from './employee-service-headers.ts';

export type SafetyRemovalEnv = {
  enabled: boolean; origin: string; supabaseUrl: string; serviceKey: string;
  turnstileSecret: string;
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export async function safetyRemoval(request: Request, env: SafetyRemovalEnv, upstream: typeof fetch = fetch): Promise<Response> {
  const headers = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', vary: 'Origin',
    'access-control-allow-origin': env.origin, 'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, apikey' };
  const reply = (status: number, message: string) => Response.json({ message }, { status, headers });
  if (!env.enabled) return reply(503, 'Online intake is unavailable. Contact support@dojipro.com. Do not send images.');
  if (!env.origin || request.headers.get('origin') !== env.origin) return reply(403, 'Origin not allowed.');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply(405, 'Use the secure request form.');
  if (!env.serviceKey || !env.turnstileSecret || !env.supabaseUrl) return reply(503, 'Online intake is unavailable. Contact support@dojipro.com. Do not send images.');
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415, 'Only text form details are accepted.');
  let body: Record<string, unknown>;
  try {
    const input: unknown = await readJsonBody(request, 24_000);
    if (!object(input)) return reply(400, 'Invalid request details.');
    body = input;
  } catch { return reply(400, 'Request details are invalid or too long.'); }
  if (Object.keys(body).some(k => !['action','id','secret','verification','request'].includes(k))
    || !['submit','status'].includes(String(body.action)) || typeof body.id !== 'string' || !uuid.test(body.id)
    || typeof body.secret !== 'string' || !/^[a-f0-9]{64}$/.test(body.secret)
    || typeof body.verification !== 'string' || !body.verification || body.verification.length > 2048) return reply(400, 'Complete the form and security check.');
  const submit = body.action === 'submit';
  if (submit) {
    const data = body.request;
    if (!object(data) || Object.keys(data).some(k => !['name','contact','relationship','location','statement','signature','consent','reason','detail'].includes(k))
      || data.consent !== true || !['depicted','representative','witness'].includes(String(data.relationship))
      || typeof data.reason !== 'string' || !/^[a-z_]{1,50}$/.test(data.reason)
      || typeof data.detail !== 'string' || !/^[a-z_]{1,50}$/.test(data.detail)) return reply(400, 'Complete the category and required declarations.');
    // Postgres independently allowlists the exact pair and derives queue/priority.
    // No client-controlled routing, deadline or severity fields are accepted.
    for (const [key, max] of Object.entries({name:160,contact:500,location:3000,statement:3000,signature:160})) {
      if (typeof data[key] !== 'string' || !(data[key] as string).trim() || (data[key] as string).length > max) return reply(400, 'Provide your name, safe contact, content location, statement and signature within the displayed limits.');
    }
  } else if (body.request !== undefined) return reply(400, 'Unexpected status field.');
  try {
    const verification = await upstream('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({secret:env.turnstileSecret,response:body.verification}),
    });
    const bot: unknown = await verification.json();
    if (!verification.ok || !object(bot) || bot.success !== true || bot.hostname !== new URL(env.origin).hostname
      || bot.action !== 'safety_removal') return reply(400, 'Complete a fresh security check and try again. Your form has not been cleared.');
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.secret)))].map(v=>v.toString(16).padStart(2,'0')).join('');
    const response = await upstream(`${env.supabaseUrl.replace(/\/$/,'')}/rest/v1/rpc/${submit ? 'submit_safety_removal_v1' : 'get_safety_removal_status_v1'}`, {
      method:'POST', headers:employeeServiceHeaders(env.serviceKey), signal:AbortSignal.timeout(8000),
      body:JSON.stringify({p_id:body.id,p_token_hash:hash,...(submit?{p_request:body.request}:{})}),
    });
    if (!response.ok) {
      const error = await response.json().catch(()=>({})) as {code?:string};
      if (!submit && error.code==='P0002') return reply(404,'No receipt matches those details. Check both the reference and private code.');
      if (error.code==='22023') return reply(400,'Request details did not match the form or original receipt. Keep your reference and contact support if needed.');
      if (error.code==='P0001') return reply(429,'Online intake is busy. Contact support@dojipro.com with the request details, not images.');
      return reply(503,'We could not confirm receipt. Keep this page open and retry unchanged, or contact support@dojipro.com. Do not send images.');
    }
    const value: unknown = await response.json();
    if (!object(value) || value.id!==body.id || typeof value.received_at!=='string' || typeof value.state!=='string') throw new Error('Invalid receipt');
    // Explicit projection: database metadata can never accidentally expose private fields.
    return Response.json({id:value.id,received_at:value.received_at,deadline_at:value.deadline_at,
      state:value.state,message:value.message,updated_at:value.updated_at},{status:submit?201:200,headers});
  } catch {
    // Never log request bodies, status secrets, provider bodies or personal allegations.
    return reply(503,'We could not confirm receipt. Keep this page open and retry unchanged, or contact support@dojipro.com. Do not send images.');
  }
}
