import { escapeHtml } from './doji-email.ts';
import { employeeServiceHeaders } from './employee-service-headers.ts';

export function renderEmployeeVerificationEmail(email: string, actionLink: string, origin: string) {
  const setup = `${origin}/employee-setup/`;
  const safeLink = /^https:\/\//.test(actionLink) ? escapeHtml(actionLink) : '#';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>Verify your Doji work email</title>
  <style>@media only screen and (max-width:640px){.shell{width:100%!important}.pad{padding:28px 24px!important}.title{font-size:32px!important;line-height:37px!important}}</style></head>
  <body style="margin:0;padding:0;background:#eef0f5;font-family:Arial,Helvetica,sans-serif;color:#191b22">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">One click to verify your work email. Your Doji workspace starts here.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f5"><tr><td align="center" style="padding:28px 12px">
  <table role="presentation" class="shell" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;border-spacing:0;background:#fff;border-radius:24px;overflow:hidden">
  <tr><td class="pad" style="padding:38px 40px;background:#191b22;border-top:6px solid #ff684b">
    <p style="margin:0 0 36px;color:#fff;font-size:24px;font-weight:800">Doji <span style="color:#bfc2cf;font-size:10px;letter-spacing:2px;vertical-align:middle">&nbsp; WORKSPACE</span></p>
    <p style="margin:0 0 14px;font-size:11px;font-weight:800;letter-spacing:2px;color:#ff9b83">WELCOME TO YOUR WORK ACCOUNT</p>
    <h1 class="title" style="margin:0 0 16px;font-size:40px;line-height:44px;letter-spacing:-1px;color:#fff">Good work starts here.</h1>
    <p style="margin:0;font-size:16px;line-height:25px;color:#d0d2dc">Let’s make this account yours. Verify your work email to continue your secure setup.</p>
  </td></tr>
  <tr><td class="pad" style="padding:32px 40px">
    <p style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:1.5px;color:#626b7c">YOUR WORK EMAIL</p>
    <p style="margin:0 0 25px;font-size:18px;line-height:26px;font-weight:700;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(email)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#ff684b;border-radius:12px;text-align:center"><a href="${safeLink}" style="display:inline-block;padding:17px 24px;font-size:15px;font-weight:800;color:#17191f;text-decoration:none">Verify my work email →</a></td></tr></table>
    <p style="margin:28px 0 10px;font-size:16px;font-weight:800">Then, you’re two steps away.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e6e8ef">
      <tr><td style="padding:18px 14px 10px 0;vertical-align:top;color:#b3452d;font-weight:800;font-size:12px">01</td><td style="padding:16px 0 10px;font-size:14px;line-height:22px"><strong>Secure your sign-in</strong><br><span style="color:#626b7c">Sign in and connect an authenticator—or use the one you already have.</span></td></tr>
      <tr><td style="padding:10px 14px 18px 0;vertical-align:top;color:#b3452d;font-weight:800;font-size:12px">02</td><td style="padding:8px 0 18px;font-size:14px;line-height:22px"><strong>Get your workspace permissions</strong><br><span style="color:#626b7c">Your administrator approves access separately. Verification alone does not grant access.</span></td></tr>
    </table>
    <p style="margin:12px 0 0;padding:16px;background:#f5f6fa;border-radius:12px;font-size:13px;line-height:21px;color:#626b7c"><strong style="color:#272c36">Your personal Doji stays personal.</strong><br>This work identity is separate from your member account.</p>
    <p style="margin:22px 0 0;font-size:13px;line-height:21px;color:#626b7c">Already verified or need a fresh link? <a href="${escapeHtml(setup)}" style="color:#9e3e2b;font-weight:700">Return to employee setup</a>. Use the newest verification email.</p>
  </td></tr></table>
  <p style="max-width:520px;margin:20px auto 0;font-size:12px;line-height:19px;color:#687184">Didn’t request this account? You can ignore this email.<br>Keep this link private. Doji will never ask for your password or authenticator code.</p>
  </td></tr></table></body></html>`;
  const text = `DOJI WORKSPACE\n\nGood work starts here.\n\nVerify your work email: ${email}\n\nVerify my work email → ${actionLink}\n\nNext: sign in and connect your authenticator, or use the one you already have. Your administrator approves workspace permissions separately. Verification alone does not grant access.\n\nYour personal Doji stays personal. This work identity is separate from your member account.\n\nAlready verified or need a fresh link? ${setup}\nUse the newest verification email.\n\nDidn’t request this account? Ignore this email. Keep this link private. Doji will never ask for your password or authenticator code.`;
  return { html, text };
}

type EmailEnv = { supabaseUrl: string; serviceKey: string; origin: string; resendKey?: string; fromEmail?: string };
// Called only after the durable employee-only registration/resend budget claim.
// Member Auth templates, hooks, redirects and SMTP settings remain untouched.
export async function sendEmployeeVerification(email: string, env: EmailEnv, upstream: typeof fetch): Promise<boolean> {
  if (!env.resendKey || !env.fromEmail) return false;
  const base = env.supabaseUrl.replace(/\/$/, '');
  const headers = employeeServiceHeaders(env.serviceKey);
  const found = await upstream(`${base}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&page=1&per_page=2`, {
    method: 'GET', headers, signal: AbortSignal.timeout(8000),
  });
  if (!found.ok) return false;
  const directory = await found.json();
  const user = directory?.users?.find((item: { email?: string }) => item.email?.toLowerCase() === email);
  if (!user?.id || user.role !== 'doji_employee' || user.app_metadata?.account_type !== 'employee' || user.email_confirmed_at) return false;
  // No password/data arguments: existing credentials and identity metadata cannot be replaced.
  const generated = await upstream(`${base}/auth/v1/admin/generate_link`, {
    method: 'POST', headers, body: JSON.stringify({ type: 'signup', email, redirect_to: `${env.origin}/` }), signal: AbortSignal.timeout(8000),
  });
  if (!generated.ok) return false;
  const link = await generated.json();
  if (link.id !== user.id || link.role !== 'doji_employee' || link.app_metadata?.account_type !== 'employee'
    || link.email?.toLowerCase() !== email || link.verification_type !== 'signup' || !link.hashed_token) return false;
  const url = new URL(link.action_link);
  if (url.origin !== new URL(base).origin || url.pathname !== '/auth/v1/verify'
    || url.searchParams.get('type') !== 'signup' || url.searchParams.get('redirect_to') !== `${env.origin}/`) return false;
  const content = renderEmployeeVerificationEmail(email, url.href, env.origin);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(link.hashed_token));
  const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const sent = await upstream('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${env.resendKey}`, 'content-type': 'application/json', 'idempotency-key': `employee-verification/${key}` },
    body: JSON.stringify({ from: env.fromEmail, to: [email], subject: 'Verify your Doji work email · Your workspace starts here', ...content }),
    signal: AbortSignal.timeout(8000),
  });
  return sent.ok;
}
