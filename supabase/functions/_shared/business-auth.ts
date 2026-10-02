// Separate, default-off business boundary. Never log bodies or credentials.
import { employeeServiceHeaders as serviceHeaders } from './employee-service-headers.ts';
import { renderDojiEmail } from './doji-email.ts';
import { readJsonBody } from './json-body.ts';
import { readBusinessLink, signBusinessLink } from './business-link.ts';

export type BusinessAuthEnv = {
  enabled: boolean;
  origin: string;
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
  resendKey?: string;
  fromEmail?: string;
  linkKey?: string;
  publicAdmission?: boolean;
  turnstileSecret?: string;
};
type Identity = {
  id?: string;
  email?: string;
  role?: string;
  app_metadata?: { account_type?: string };
  email_confirmed_at?: string;
};
const receipt =
  'If this address is eligible and sending is available, check your email. Otherwise use your separate business account or contact support.';
const identityMatches = (u: Identity, email: string, id?: string) =>
  Boolean(
    u?.id &&
    (!id || u.id === id) &&
    u.email?.toLowerCase() === email &&
    u.role === 'doji_business' &&
    u.app_metadata?.account_type === 'business',
  );

export async function businessAuth(
  request: Request,
  env: BusinessAuthEnv,
  upstream: typeof fetch = fetch,
): Promise<Response> {
  const headers = {
    'access-control-allow-origin': env.origin,
    vary: 'Origin',
    'cache-control': 'no-store',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, apikey, authorization, x-client-info',
  };
  const reply = (status: number, message: string) =>
    Response.json({ message }, { status, headers });
  if (!env.enabled) return reply(404, 'Business access is not enabled.');
  // Production origin is exact HTTPS, not an arbitrary redirect supplied by a client.
  try {
    const origin = new URL(env.origin);
    if (origin.protocol !== 'https:' || origin.origin !== env.origin) throw new Error();
  } catch {
    return reply(503, 'Business access is unavailable.');
  }
  if (request.headers.get('origin') !== env.origin) return reply(403, 'Origin not allowed.');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply(405, 'Method not allowed.');
  if (!env.supabaseUrl || !env.anonKey || !env.serviceKey)
    return reply(503, 'Business access is unavailable.');
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(request, 4096);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
  } catch {
    return reply(400, 'Invalid account details.');
  }
  const action = body.action;
  if (!['register', 'signin', 'resend', 'recover', 'verify'].includes(String(action)))
    return reply(400, 'Invalid account action.');
  const allowed =
    action === 'verify'
      ? ['action', 'ticket']
      : action === 'register'
        ? [
            'action',
            'email',
            'password',
            'displayName',
            'termsAccepted',
            'privacyAcknowledged',
            'termsVersion',
            'privacyVersion',
            'country',
          ]
        : action === 'signin'
          ? ['action', 'email', 'password']
          : ['action', 'email'];
  if (env.publicAdmission === true && action !== 'verify') allowed.push('verificationToken');
  if (Object.keys(body).some((key) => !allowed.includes(key)))
    return reply(400, 'Unexpected account field.');
  const ticket =
    action === 'verify' ? await readBusinessLink(body.ticket, env.linkKey || '', env.origin) : null;
  if (action === 'verify' && !ticket)
    return reply(400, 'This business link is invalid or expired. Request a new email.');
  const email =
    ticket?.email || (typeof body.email === 'string' ? body.email.trim().toLowerCase() : '');
  const password = typeof body.password === 'string' ? body.password : '';
  const name = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  if (action === 'register' && body.country !== 'US')
    return reply(400, 'Business onboarding is currently available only to United States businesses.');
  if (
    action === 'register' &&
    (body.termsAccepted !== true ||
      body.privacyAcknowledged !== true ||
      typeof body.termsVersion !== 'string' ||
      !/^[A-Za-z0-9._-]{1,100}$/.test(body.termsVersion) ||
      typeof body.privacyVersion !== 'string' ||
      !/^[A-Za-z0-9._-]{1,100}$/.test(body.privacyVersion))
  )
    return reply(
      400,
      'Accept the business terms and acknowledge the privacy notice before creating an account.',
    );
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    (action === 'signin' && (!password || password.length > 128)) ||
    (action === 'register' &&
      (!name ||
        name.length > 80 ||
        /[\x00-\x1f\x7f]/.test(name) ||
        password.length < 12 ||
        password.length > 128))
  ) {
    return reply(
      400,
      'Enter valid business account details. New passwords must be 12–128 characters.',
    );
  }
  if (
    ['register', 'resend', 'recover'].includes(String(action)) &&
    (!env.resendKey || !env.fromEmail || !env.linkKey || env.linkKey.length < 32)
  )
    return reply(503, 'Business email is unavailable.');
  const base = env.supabaseUrl.replace(/\/$/, '');
  const call = (path: string, data?: unknown, key = env.serviceKey) =>
    upstream(`${base}${path}`, {
      method: data === undefined ? 'GET' : 'POST',
      headers:
        key === env.serviceKey
          ? serviceHeaders(key)
          : { apikey: key, 'content-type': 'application/json' },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      signal: AbortSignal.timeout(8000),
    });
  try {
    if (env.publicAdmission === true && action !== 'verify') {
      // CORS is not abuse prevention. Validate single-use proof server-side,
      // bound to this exact production hostname AND operation. No retry/fallback.
      if (!env.turnstileSecret) return reply(503, 'Business security verification is unavailable.');
      if (
        typeof body.verificationToken !== 'string' ||
        !body.verificationToken ||
        body.verificationToken.length > 2048
      )
        return reply(400, 'Complete the security check and try again.');
      const checked = await upstream('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret: env.turnstileSecret, response: body.verificationToken }),
      });
      const proof = checked.ok ? await checked.json() : null;
      if (
        proof?.success !== true ||
        proof.hostname !== new URL(env.origin).hostname ||
        proof.action !== `business_${action}`
      )
        return reply(400, 'The security check expired or could not be verified. Please try again.');
    }
    if (action === 'register') {
      const legal = await call('/rest/v1/rpc/check_business_signup_legal_v1', {
        p_terms_version: body.termsVersion,
        p_privacy_version: body.privacyVersion,
      });
      if (!legal.ok) return reply(503, 'Business registration is temporarily unavailable.');
      if ((await legal.json()) !== true)
        return reply(
          409,
          'The business documents changed. Reload and review the current versions.',
        );
    }
    const admission =
      env.publicAdmission === true ? 'claim_public_business_auth_v1' : 'claim_business_auth_v1';
    const reserved = await call(`/rest/v1/rpc/${admission}`, {
      p_action: action,
      p_email: email,
    });
    if (!reserved.ok) return reply(503, 'Business access is temporarily unavailable.');
    const claim = await reserved.json();
    if (env.publicAdmission === true && claim?.allowed === false) {
      if (action === 'register' && claim.reason === 'registration_paused')
        return reply(
          503,
          'New business registrations are temporarily paused. Existing businesses can still sign in. Please try later or contact support.',
        );
      if (
        ['register', 'resend', 'recover'].includes(String(action)) &&
        claim.reason === 'email_paused'
      )
        return reply(
          503,
          'Business email requests are temporarily paused. No email was sent for this request. Please try later or contact support.',
        );
    }
    if (claim?.allowed !== true)
      return action === 'verify'
        ? reply(403, 'This business link cannot be used. Contact support or request a new email.')
        : action === 'signin'
          ? reply(
              401,
              'Unable to sign in. Check your separate business credentials, verify your email, or try later.',
            )
          : reply(202, receipt);
    if (action === 'verify' && ticket) {
      if (claim.user_id !== ticket.id) return reply(403, 'This business link cannot be used.');
      const result = await call(
        '/auth/v1/verify',
        { token_hash: ticket.token_hash, type: ticket.type },
        env.anonKey,
      );
      if (!result.ok)
        return reply(400, 'This business link is expired or already used. Request a new email.');
      const session = await result.json();
      if (
        !identityMatches(session?.user, email, ticket.id) ||
        !session.user.email_confirmed_at ||
        typeof session.access_token !== 'string' ||
        typeof session.refresh_token !== 'string'
      )
        return reply(503, 'Business identity could not be verified.');
      return Response.json({ ...session, business_flow: ticket.type }, { headers });
    }
    if (action === 'signin') {
      if (typeof claim.user_id !== 'string')
        return reply(503, 'Business identity could not be verified.');
      // Precheck precedes password exchange: member sessions must never be created here.
      const result = await call(
        '/auth/v1/token?grant_type=password',
        { email, password },
        env.anonKey,
      );
      if (!result.ok)
        return reply(
          401,
          'Unable to sign in. Check your separate business credentials or try later.',
        );
      const session = await result.json();
      if (
        !identityMatches(session?.user, email, claim.user_id) ||
        !session.user.email_confirmed_at ||
        typeof session.access_token !== 'string' ||
        typeof session.refresh_token !== 'string'
      ) {
        return reply(503, 'Business identity could not be verified.');
      }
      return Response.json(session, { headers });
    }
    let id = claim.user_id;
    if (action === 'register') {
      const created = await call('/auth/v1/admin/users', {
        email,
        password,
        role: 'doji_business',
        email_confirm: false,
        app_metadata: {
          account_type: 'business',
          business_signup: {
            terms_accepted: true,
            privacy_acknowledged: true,
            terms_version: body.termsVersion,
            privacy_version: body.privacyVersion,
          },
        },
        user_metadata: { display_name: name },
      });
      if (!created.ok) {
        const error = await created.json().catch(() => ({}));
        if (['email_exists', 'user_already_exists'].includes(error.code))
          return reply(202, receipt);
        return reply(
          503,
          'Account creation could not be confirmed. Contact support before retrying.',
        );
      }
      const user = await created.json();
      if (!identityMatches(user, email) || user.email_confirmed_at)
        return reply(503, 'Business setup requires administrator attention.');
      id = user.id;
    }
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))
      return reply(503, 'Business identity could not be verified.');
    // Fetch the exact reserved identity, not an unbounded/paged email directory.
    const found = await call(`/auth/v1/admin/users/${id}`);
    if (!found.ok) return reply(202, receipt);
    const user = await found.json();
    if (
      !identityMatches(user, email, id) ||
      Boolean(user.email_confirmed_at) !== (action === 'recover')
    )
      return reply(202, receipt);
    const type = action === 'recover' ? 'recovery' : 'signup';
    const redirect = `${env.origin}/business-portal/access/`;
    const generated = await call('/auth/v1/admin/generate_link', {
      type,
      email,
      redirect_to: redirect,
    });
    if (!generated.ok) return reply(202, receipt);
    const link = await generated.json();
    if (
      !identityMatches(link, email, id) ||
      link.verification_type !== type ||
      typeof link.hashed_token !== 'string' ||
      !link.hashed_token
    )
      return reply(202, receipt);
    const providerUrl = new URL(link.action_link);
    if (
      providerUrl.origin !== new URL(base).origin ||
      providerUrl.pathname !== '/auth/v1/verify' ||
      providerUrl.searchParams.get('type') !== type ||
      providerUrl.searchParams.get('redirect_to') !== redirect
    )
      return reply(202, receipt);
    // Fragment avoids server/referrer logs. The access page must require an explicit
    // confirmation click before redeeming this one-time link (email scanner safety).
    const envelope = await signBusinessLink(
      { id, email, token_hash: link.hashed_token, type },
      env.linkKey!,
      env.origin,
    );
    const target = `${redirect}#${new URLSearchParams({ ticket: envelope })}`;
    const content = renderDojiEmail({
      eyebrow: 'Business account',
      preheader:
        type === 'signup' ? 'Verify your business email.' : 'Reset your business password.',
      title: type === 'signup' ? 'Verify your email' : 'Reset your password',
      summary:
        type === 'signup'
          ? 'Confirm this email to continue your separate Doji business application. Verification does not approve a business or publish a campaign.'
          : 'Use this secure link to choose a new password for your separate Doji business account.',
      tone: 'info',
      actions: [
        {
          label: type === 'signup' ? 'Verify email' : 'Reset password',
          href: target,
          kind: 'primary',
        },
      ],
      footerNote:
        'If you did not request this email, ignore it. Your personal Doji account is separate.',
    });
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${type}:${link.hashed_token}`),
    );
    const key = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    await upstream('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: {
        authorization: `Bearer ${env.resendKey}`,
        'content-type': 'application/json',
        'idempotency-key': `business-auth/${key}`,
      },
      body: JSON.stringify({
        from: env.fromEmail,
        to: [email],
        subject:
          type === 'signup'
            ? 'Verify your Doji business email'
            : 'Reset your Doji business password',
        ...content,
      }),
    });
    // Same reply for unknown, duplicate, budget-denied and provider failure; never
    // claim inbox delivery. Provider acceptance must be separately qualified.
    return reply(202, receipt);
  } catch {
    return action === 'signin' || action === 'register' || action === 'verify'
      ? reply(503, 'Business access could not be confirmed. Try later or contact support.')
      : reply(202, receipt);
  }
}
