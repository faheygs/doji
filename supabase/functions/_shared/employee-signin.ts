// Check the server-owned identity class BEFORE a password login. Even creating
// a member session could invalidate another session under a single-session policy.
import { employeeServiceHeaders } from './employee-service-headers.ts';
export type EmployeeSigninEnv = { enabled: boolean; origin: string; supabaseUrl: string; anonKey: string; serviceKey: string };

export async function signInEmployee(request: Request, env: EmployeeSigninEnv, upstream: typeof fetch = fetch): Promise<Response> {
  const headers = { 'access-control-allow-origin': env.origin,
    'access-control-allow-headers': 'content-type, apikey, authorization, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS', 'cache-control': 'no-store', vary: 'Origin' };
  const reply = (status: number, message: string) => Response.json({ message }, { status, headers });
  if (!env.enabled) return reply(404, 'Employee sign-in is not enabled.');
  if (!env.origin || request.headers.get('origin') !== env.origin) return reply(403, 'Origin not allowed.');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply(405, 'Method not allowed.');
  if (!env.serviceKey || !env.anonKey || !env.supabaseUrl) return reply(503, 'Employee sign-in is unavailable.');
  let email: string; let password: string;
  try {
    const reader = request.body?.getReader(); if (!reader) return reply(400, 'Sign-in details required.');
    let raw = ''; let size = 0; const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 2048) { await reader.cancel(); return reply(413, 'Sign-in details are too large.'); }
        raw += decoder.decode(chunk.value, { stream: true });
      }
    } finally { reader.releaseLock(); }
    const body = JSON.parse(raw + decoder.decode());
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some((key) => !['email','password'].includes(key))) return reply(400, 'Invalid sign-in details.');
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    password = typeof body.password === 'string' ? body.password : '';
    if (!email || email.length > 254 || !password || password.length > 128) return reply(400, 'Enter your employee email and password.');
  } catch { return reply(400, 'Invalid sign-in details.'); }
  const base = env.supabaseUrl.replace(/\/$/, '');
  try {
    const check = await upstream(`${base}/rest/v1/rpc/employee_login_allowed_v1`, {
      method: 'POST', headers: employeeServiceHeaders(env.serviceKey),
      body: JSON.stringify({ p_email: email }), signal: AbortSignal.timeout(8000),
    });
    if (!check.ok) return reply(503, 'Employee sign-in is unavailable.');
    if (await check.json() !== true) return reply(401, 'Unable to sign in. Use your separate employee credentials or try again later.');
    const result = await upstream(`${base}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: env.anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(8000),
    });
    const session = await result.json();
    if (!result.ok) return reply(401, 'Unable to sign in. Check your employee credentials and verify your email.');
    if (session?.user?.role !== 'doji_employee' || session?.user?.app_metadata?.account_type !== 'employee') {
      return reply(403, 'Employee identity could not be verified.');
    }
    return Response.json(session, { headers });
  } catch { return reply(503, 'Employee sign-in is temporarily unavailable.'); }
}
