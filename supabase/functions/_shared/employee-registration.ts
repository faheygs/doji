// Dedicated registration boundary. Never convert an existing Auth user or accept
// caller-provided roles, confirmation state, app metadata, or redirect URLs.
import { employeeServiceHeaders } from './employee-service-headers.ts';
import { sendEmployeeVerification } from './employee-email.ts';
export type EmployeeRegistrationEnv = {
  enabled: boolean;
  origin: string;
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
  enrollmentEmails?: string;
  resendKey?: string;
  fromEmail?: string;
};

export async function registerEmployee(
  request: Request,
  env: EmployeeRegistrationEnv,
  upstream: typeof fetch = fetch,
): Promise<Response> {
  const headers = {
    'access-control-allow-origin': env.origin,
    'access-control-allow-headers': 'content-type, apikey, authorization, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
    'cache-control': 'no-store',
    vary: 'Origin',
  };
  const reply = (status: number, message: string) => Response.json({ message }, { status, headers });
  if (!env.enabled) return reply(404, 'Employee registration is not enabled.');
  if (!env.origin || request.headers.get('origin') !== env.origin) return reply(403, 'Origin not allowed.');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply(405, 'Method not allowed.');
  if (!env.serviceKey || !env.anonKey || !env.supabaseUrl) return reply(503, 'Employee registration is unavailable.');
  if (!env.resendKey || !env.fromEmail) return reply(503, 'Employee verification email is not configured. Contact the administrator.');
  let body: Record<string, unknown>;
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply(400, 'Registration details required.');
    let raw = ''; let size = 0;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 4096) { await reader.cancel(); return reply(413, 'Registration details are too large.'); }
        raw += decoder.decode(chunk.value, { stream: true });
      }
    } finally { reader.releaseLock(); }
    const parsed: unknown = JSON.parse(raw + decoder.decode());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return reply(400, 'Invalid registration details.');
    body = parsed as Record<string, unknown>;
  } catch { return reply(400, 'Invalid registration details.'); }
  const resend = body.action === 'resend_verification';
  const allowedFields = resend ? ['email', 'action'] : ['email', 'password', 'displayName'];
  if (Object.keys(body).some((key) => !allowedFields.includes(key))) {
    return reply(400, 'Unexpected registration field.');
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
    || (!resend && (!name || name.length > 80 || password.length < 12 || password.length > 128))) {
    return reply(400, resend ? 'Use a valid employee email.' : 'Use a valid email, your name, and a password of 12–128 characters.');
  }
  const base = env.supabaseUrl.replace(/\/$/, '');
  if (env.enrollmentEmails !== undefined && !env.enrollmentEmails.split(',').map(value => value.trim().toLowerCase()).includes(email)) {
    return reply(403, 'Employee enrollment is limited during setup. Contact the administrator.');
  }
  const serviceHeaders = employeeServiceHeaders(env.serviceKey);
  try {
    if (resend) {
      const claim = await upstream(`${base}/rest/v1/rpc/claim_employee_verification_v1`, {
        method: 'POST', headers: serviceHeaders, body: JSON.stringify({ p_email: email }), signal: AbortSignal.timeout(8000),
      });
      if (!claim.ok) return reply(503, 'Employee verification is unavailable. Please try again later.');
      if (await claim.json() === true) {
        // Do not expose whether the address exists, is already verified, belongs
        // to a member, is over budget, or experienced provider delivery failure.
        await sendEmployeeVerification(email, env, upstream).catch(() => false);
      }
      return reply(202, 'If this is an unverified employee account and sending is available, a verification email will arrive. Check spam too. If it does not arrive, contact the administrator.');
    }
    const budget = await upstream(`${base}/rest/v1/rpc/claim_employee_registration_v1`, {
      method: 'POST', headers: serviceHeaders, body: '{}', signal: AbortSignal.timeout(8000),
    });
    if (!budget.ok) return reply(503, 'Employee registration is unavailable.');
    if (await budget.json() !== true) return reply(429, 'Employee registration limit reached. Contact the administrator.');
    const created = await upstream(`${base}/auth/v1/admin/users`, {
      method: 'POST', headers: serviceHeaders, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ email, password, role: 'doji_employee', email_confirm: false,
        app_metadata: { account_type: 'employee' }, user_metadata: { display_name: name } }),
    });
    if (!created.ok) {
      // Duplicate registrations never reset passwords, change roles, send member
      // mail or reveal whether an address belongs to a member or employee.
      const failure = await created.json().catch(() => ({})) as { code?: string };
      if (['email_exists', 'user_already_exists'].includes(failure.code || '')) {
        return reply(202, 'If a new employee account was created, check your email. Existing accounts can sign in.');
      }
      return reply(503, 'Registration could not be completed. Contact the administrator before retrying.');
    }
    const user = await created.json() as { role?: string; app_metadata?: { account_type?: string } };
    if (user.role !== 'doji_employee' || user.app_metadata?.account_type !== 'employee') {
      return reply(503, 'Registration requires administrator attention.');
    }
    const confirmation = await sendEmployeeVerification(email, env, upstream).catch(() => false);
    if (!confirmation) return reply(503, 'Your employee account was created, but verification email could not be sent. Use Resend verification email, or contact the administrator.');
    return reply(202, 'Check your email to verify your employee account. Sign in afterward to request approval.');
  } catch {
    // Never log passwords, tokens, request bodies, or Auth provider bodies.
    return reply(503, 'Registration could not be confirmed. Contact the administrator before retrying.');
  }
}
