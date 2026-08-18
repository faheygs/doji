/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertCronAuthorized } from '../_shared/cron-auth.ts';

// Prerequisites (set in Supabase Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY = re_...         (from resend.com)
//   ADMIN_FROM_EMAIL = Doji <noreply@yourdomain.com>  (must be a verified sender in Resend)

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const ADMIN_EMAIL = 'faheygs@gmail.com';
const FROM_EMAIL = Deno.env.get('ADMIN_FROM_EMAIL') ?? 'Doji <noreply@doji.app>';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

Deno.serve(async (req) => {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) {
    console.error('send-admin-email: RESEND_API_KEY not configured');
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload = (await req.json()) as Record<string, unknown>;
    const event = payload.event as string;

    let subject = '';
    let html = '';

    if (event === 'report') {
      const reportId       = payload.report_id       as string;
      const reason         = payload.reason          as string;
      const reporterId     = payload.reporter_id     as string;
      const reportedUserId = payload.reported_user_id as string | null;
      const postId         = payload.post_id         as string | null;

      const [reporterRes, reportedRes] = await Promise.all([
        supabase.from('profiles').select('username, display_name').eq('id', reporterId).maybeSingle(),
        reportedUserId
          ? supabase.from('profiles').select('username, display_name').eq('id', reportedUserId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      const reporterName = escapeHtml(reporterRes.data?.username ?? reporterId);
      const reportedName = escapeHtml(reportedRes.data?.username ?? reportedUserId ?? 'unknown');
      const safeReason = escapeHtml(reason);
      const safePostId = escapeHtml(postId);
      const safeReportId = escapeHtml(reportId);

      subject = `[Doji] Content Report — ${String(reason ?? 'other').slice(0, 80)}`;
      html = `
        <h2 style="margin:0 0 16px">Content Report Received</h2>
        <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
          <tr><td style="padding:4px 12px 4px 0;color:#666">Reason</td><td><strong>${safeReason}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#666">Reporter</td><td>@${reporterName}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#666">Reported user</td><td>@${reportedName}</td></tr>
          ${postId ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Post ID</td><td>${safePostId}</td></tr>` : ''}
          <tr><td style="padding:4px 12px 4px 0;color:#666">Report ID</td><td>${safeReportId}</td></tr>
        </table>
        <p style="margin-top:24px;font-family:sans-serif;font-size:14px;color:#666">
          Action required within 24 hours. Review in the admin panel → Reports.
        </p>
      `;
    } else {
      return new Response(JSON.stringify({ error: 'Unknown event type' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: [ADMIN_EMAIL], subject, html }),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error('Resend error:', result);
      return new Response(JSON.stringify({ error: 'Email send failed', detail: result }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: (result as { id?: string }).id }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('send-admin-email error:', err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
