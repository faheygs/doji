import { renderDojiEmail } from './doji-email.ts';
import { employeeServiceHeaders } from './employee-service-headers.ts';

export function renderEmployeeVerificationEmail(email: string, actionLink: string, origin: string) {
  const setup = `${origin}/employee-setup/`;
  const { html } = renderDojiEmail({
    brand: 'Doji Workspace',
    preheader: 'One click to verify your work email. Your Doji workspace starts here.',
    eyebrow: 'Welcome to your work account',
    title: 'Good work starts here.',
    summary: 'Let’s make this account yours. Verify your work email to continue your secure setup.',
    facts: [{ label: 'Your work email', value: email }],
    actions: [
      { label: 'Verify my work email', href: /^https:\/\//.test(actionLink) ? actionLink : '#' },
      { label: 'Return to employee setup', href: setup, kind: 'secondary' },
    ],
    sections: [
      {
        heading: 'Secure your sign-in',
        body: 'Sign in and connect an authenticator—or use the one you already have.',
      },
      {
        heading: 'Get your workspace permissions',
        body: 'Your administrator approves access separately. Verification alone does not grant access.',
      },
      {
        heading: 'Your personal Doji stays personal.',
        body: 'This work identity is separate from your member account. Already verified or need a fresh link? Return to employee setup. Use the newest verification email.',
      },
    ],
    footerNote:
      'Didn’t request this account? You can ignore this email. Keep this link private. Doji will never ask for your password or authenticator code.',
  });
  const text = `DOJI WORKSPACE\n\nGood work starts here.\n\nVerify your work email: ${email}\n\nVerify my work email → ${actionLink}\n\nNext: sign in and connect your authenticator, or use the one you already have. Your administrator approves workspace permissions separately. Verification alone does not grant access.\n\nYour personal Doji stays personal. This work identity is separate from your member account.\n\nAlready verified or need a fresh link? ${setup}\nUse the newest verification email.\n\nDidn’t request this account? Ignore this email. Keep this link private. Doji will never ask for your password or authenticator code.`;
  return { html, text };
}

type EmailEnv = {
  supabaseUrl: string;
  serviceKey: string;
  origin: string;
  resendKey?: string;
  fromEmail?: string;
};
// Called only after the durable employee-only registration/resend budget claim.
// Member Auth templates, hooks, redirects and SMTP settings remain untouched.
export async function sendEmployeeVerification(
  email: string,
  env: EmailEnv,
  upstream: typeof fetch,
): Promise<boolean> {
  if (!env.resendKey || !env.fromEmail) return false;
  const base = env.supabaseUrl.replace(/\/$/, '');
  const headers = employeeServiceHeaders(env.serviceKey);
  const found = await upstream(
    `${base}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&page=1&per_page=2`,
    {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!found.ok) return false;
  const directory = await found.json();
  const user = directory?.users?.find(
    (item: { email?: string }) => item.email?.toLowerCase() === email,
  );
  if (
    !user?.id ||
    user.role !== 'doji_employee' ||
    user.app_metadata?.account_type !== 'employee' ||
    user.email_confirmed_at
  )
    return false;
  // No password/data arguments: existing credentials and identity metadata cannot be replaced.
  const generated = await upstream(`${base}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'signup', email, redirect_to: `${env.origin}/` }),
    signal: AbortSignal.timeout(8000),
  });
  if (!generated.ok) return false;
  const link = await generated.json();
  if (
    link.id !== user.id ||
    link.role !== 'doji_employee' ||
    link.app_metadata?.account_type !== 'employee' ||
    link.email?.toLowerCase() !== email ||
    link.verification_type !== 'signup' ||
    !link.hashed_token
  )
    return false;
  const url = new URL(link.action_link);
  if (
    url.origin !== new URL(base).origin ||
    url.pathname !== '/auth/v1/verify' ||
    url.searchParams.get('type') !== 'signup' ||
    url.searchParams.get('redirect_to') !== `${env.origin}/`
  )
    return false;
  const content = renderEmployeeVerificationEmail(email, url.href, env.origin);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(link.hashed_token));
  const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  const sent = await upstream('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.resendKey}`,
      'content-type': 'application/json',
      'idempotency-key': `employee-verification/${key}`,
    },
    body: JSON.stringify({
      from: env.fromEmail,
      to: [email],
      subject: 'Verify your Doji work email · Your workspace starts here',
      ...content,
    }),
    signal: AbortSignal.timeout(8000),
  });
  return sent.ok;
}
