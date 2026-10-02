/// <reference path="../deno.d.ts" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertCronAuthorized } from '../_shared/cron-auth.ts';
import { fetchWithTimeout } from '../_shared/fetch-timeout.ts';
import { readJsonBody } from '../_shared/json-body.ts';
import {
  formatEmailTimestamp,
  humanizeEmailToken,
  renderDojiEmail,
  type DojiEmailFact,
  type DojiEmailTone,
} from '../_shared/doji-email.ts';

// Prerequisites (set in Supabase Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY = re_...         (from resend.com)
//   ADMIN_FROM_EMAIL = Doji <noreply@yourdomain.com>  (must be a verified sender in Resend)

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const ADMIN_EMAIL = Deno.env.get('ADMIN_ALERT_EMAIL') ?? 'faheygs@gmail.com';
const FROM_EMAIL = Deno.env.get('ADMIN_FROM_EMAIL') ?? 'Doji <noreply@doji.app>';

const ADMIN_PORTAL_URL = 'https://admin.dojipro.com/';

const REPORT_CATEGORY_LABELS: Record<string, string> = {
  bullying_harassment: 'Bullying or unwanted contact',
  self_harm: 'Suicide, self-harm or eating disorders',
  violence_hate_exploitation: 'Violence, hate or exploitation',
  restricted_goods: 'Selling or promoting restricted items',
  sexual_content: 'Nudity or sexual activity',
  spam_scam: 'Scam, fraud or spam',
  intellectual_property: 'Intellectual property',
  privacy: 'Privacy violation',
  impersonation: 'Impersonation',
  spam: 'Spam',
  inappropriate: 'Inappropriate content',
  harassment: 'Harassment',
  other: 'Other concern',
};

const CRITICAL_REPORT_DETAILS = new Set([
  'credible_threat',
  'human_exploitation',
  'nonconsensual_intimate_images',
  'sexual_exploitation',
  'child_sexual_content',
]);

function boundedString(value: unknown, max = 500): string {
  return String(value ?? '')
    .trim()
    .slice(0, max);
}

function identityLabel(
  profile: Record<string, unknown> | null | undefined,
  fallback: string,
): string {
  const username = boundedString(profile?.username, 80);
  const displayName = boundedString(profile?.display_name, 120);
  if (displayName && username) return `${displayName} (@${username})`;
  if (username) return `@${username}`;
  return fallback;
}

function reportTone(category: string, detail: string): DojiEmailTone {
  if (CRITICAL_REPORT_DETAILS.has(detail)) return 'critical';
  if (category === 'self_harm' || category === 'violence_hate_exploitation') return 'danger';
  return 'warning';
}

function reportPriority(category: string, detail: string): string {
  if (CRITICAL_REPORT_DETAILS.has(detail)) return 'Critical · restricted review';
  if (category === 'self_harm' || category === 'violence_hate_exploitation') {
    return 'High priority';
  }
  return 'Standard · 24-hour target';
}

function formatMetric(value: unknown, suffix = ''): string | null {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return `${new Intl.NumberFormat('en-US').format(number)}${suffix}`;
}

function operationalFacts(payload: Record<string, unknown>): DojiEmailFact[] {
  const definitions: Array<[string, string, string]> = [
    ['realtime_p95_ms_5m', 'Realtime p95 (5m)', ' ms'],
    ['realtime_max_ms_5m', 'Realtime max (5m)', ' ms'],
    ['realtime_sample_count_5m', 'Realtime samples (5m)', ''],
    ['realtime_over_5s_5m', 'Events over 5s (5m)', ''],
    ['realtime_retried_samples_5m', 'Realtime publish retries (5m)', ''],
    ['realtime_max_publish_attempts_5m', 'Max realtime publish attempts (5m)', ''],
    ['outbox_overdue', 'Overdue outbox rows', ''],
    ['outbox_exhausted', 'Exhausted outbox rows', ''],
    ['outbox_oldest_due_seconds', 'Oldest overdue work', ' sec'],
    ['push_stale_shards', 'Stale push shards', ''],
    ['push_exhausted_shards', 'Exhausted push shards', ''],
    ['apns_provider_credential_errors', 'APNs credential errors', ''],
    ['consecutive_unhealthy_checks', 'Consecutive unhealthy checks', ''],
    ['attempts', 'Health-read attempts', ''],
    ['upstream_status', 'Upstream HTTP status', ''],
  ];
  const facts: DojiEmailFact[] = [];
  for (const [key, label, suffix] of definitions) {
    if (payload[key] === null || payload[key] === undefined) continue;
    const value = formatMetric(payload[key], suffix);
    if (value !== null) facts.push({ label, value });
  }
  for (const [key, label] of [
    ['suspected_layer', 'Suspected layer'],
    ['failure_kind', 'Failure class'],
    ['durable_event_state', 'Durable event state'],
  ] as const) {
    const value = boundedString(payload[key], 120);
    if (value) facts.push({ label, value: humanizeEmailToken(value) });
  }
  if (typeof payload.database_writes_at_risk === 'boolean') {
    facts.push({
      label: 'Committed writes at risk',
      value: payload.database_writes_at_risk ? 'Yes' : 'No',
    });
  }
  return facts;
}

function operationalGuidance(
  issueFamily: string,
  payload: Record<string, unknown>,
): { meaning: string; steps: string[] } {
  if (issueFamily === 'realtime-delivery-degraded') {
    const suspectedLayer = String(payload.suspected_layer ?? '');
    const relayPickupDelayed = suspectedLayer === 'relay-wake-or-supabase-edge' ||
      suspectedLayer === 'relay-or-publication-path';
    return {
      meaning:
        'Committed data is still authoritative in Postgres, but live updates are arriving slower than the delivery objective.',
      steps: relayPickupDelayed
        ? [
            'Open Platform operations and compare realtime latency with durable outbox health.',
            'Review orchestrator relay timing, database waits/timeouts, and Supabase Edge Function availability for the same observation window.',
            'Compare wake, claim, provider publication, and database acknowledgement timing; a first attempt does not isolate the slow stage.',
          ]
        : [
            'Open Platform operations and compare realtime latency with durable outbox health.',
            'Compare Sentry and database timeout logs with relay/provider errors for the same observation window.',
            'Retries can follow provider failure or a failed database acknowledgement after successful publication. A recovered queue does not identify the cause.',
          ],
    };
  }
  if (issueFamily === 'domain-outbox-delayed' || issueFamily === 'domain-outbox-exhausted') {
    return {
      meaning:
        'Durable domain-event work is delayed or exhausted. The underlying application writes remain committed, but realtime and notification delivery need attention.',
      steps: [
        'Open Platform operations and inspect overdue and exhausted outbox counts.',
        'Review the relay and orchestration Sentry groups for the matching time window.',
        'Confirm the protected relay wake and provider credentials are healthy before attempting manual intervention.',
      ],
    };
  }
  if (issueFamily.includes('push') || issueFamily.includes('apns')) {
    return {
      meaning:
        'Native notification delivery is degraded. In-app state remains authoritative and will reconcile when members open or foreground Doji.',
      steps: [
        'Open Platform operations and inspect the affected provider and shard telemetry.',
        'Check recent credential/provider failures in Sentry without rotating credentials blindly.',
        'Verify the exact production release provider configuration before retrying any delivery workflow.',
      ],
    };
  }
  return {
    meaning:
      'The protected production monitor detected a condition that needs an administrator review.',
    steps: [
      'Open Platform operations and review the authoritative health snapshot.',
      'Correlate the observation time with the newest Sentry issue groups.',
      'Record any intervention in the operational audit trail.',
    ],
  };
}

Deno.serve(async (req) => {
  let operationalReceiptKey: string | null = null;
  try {
    const expectedSecret = Deno.env.get('OUTBOX_RELAY_SECRET');
    const outboxAuthorized =
      Boolean(expectedSecret) && req.headers.get('x-outbox-secret') === expectedSecret;
    const cronDenied = assertCronAuthorized(req);
    if (!outboxAuthorized && cronDenied) return cronDenied;

    const payload = await readJsonBody<Record<string, unknown>>(req);
    const event = payload.event as string;

    if (event === 'operational_health') {
      if (!outboxAuthorized) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else {
      if (cronDenied) return cronDenied;
    }

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      console.error('send-admin-email: RESEND_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let subject = '';
    let html = '';
    let text = '';
    let idempotencyKey: string | null = null;

    if (event === 'report') {
      const reportId = payload.report_id as string;
      const reason = boundedString(payload.reason, 80);
      const reasonDetail = boundedString(payload.reason_detail, 100);
      const targetKind =
        boundedString(payload.target_kind, 50) || (payload.post_id ? 'post' : 'content');
      const reporterNotes = boundedString(payload.notes, 500);
      const createdAt = boundedString(payload.created_at, 80);
      const reporterId = payload.reporter_id as string;
      const reportedUserId = payload.reported_user_id as string | null;
      const postId = payload.post_id as string | null;
      const commentId = payload.comment_id as string | null;
      const pollVoteId = payload.poll_vote_id as string | null;

      const [reporterRes, reportedRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('username, display_name')
          .eq('id', reporterId)
          .maybeSingle(),
        reportedUserId
          ? supabase
              .from('profiles')
              .select('username, display_name')
              .eq('id', reportedUserId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      const categoryLabel = REPORT_CATEGORY_LABELS[reason] ?? humanizeEmailToken(reason || 'other');
      const detailLabel = reasonDetail ? humanizeEmailToken(reasonDetail) : 'Not specified';
      const priority = reportPriority(reason, reasonDetail);
      const tone = reportTone(reason, reasonDetail);
      const reporterName = identityLabel(reporterRes.data, reporterId);
      const reportedName = identityLabel(reportedRes.data, reportedUserId ?? 'Unknown account');
      const targetId = postId || commentId || pollVoteId;
      const template = renderDojiEmail({
        preheader: `${priority}: ${categoryLabel} · ${detailLabel}`,
        eyebrow:
          tone === 'critical'
            ? 'Restricted safety · immediate review'
            : 'Trust & safety · new report',
        title: tone === 'critical' ? 'A critical report needs you' : 'New report ready for review',
        summary: `A member reported ${humanizeEmailToken(targetKind).toLowerCase()} content. The allegation is preserved exactly as submitted; an authorized operator still owns the final policy decision.`,
        tone,
        statusLabel: priority,
        facts: [
          { label: 'Reported category', value: categoryLabel },
          { label: 'Specific concern', value: detailLabel },
          { label: 'Reported target', value: humanizeEmailToken(targetKind) },
          { label: 'Reported account', value: reportedName },
          { label: 'Reporter', value: reporterName },
          ...(createdAt ? [{ label: 'Received', value: formatEmailTimestamp(createdAt) }] : []),
          ...(targetId
            ? [{ label: 'Content reference', value: String(targetId), monospace: true }]
            : []),
        ],
        sections: [
          ...(reporterNotes
            ? [
                {
                  heading: 'Reporter context',
                  body: reporterNotes,
                },
              ]
            : []),
          {
            heading: 'What happens next',
            body:
              tone === 'critical'
                ? 'The exact reported item was routed to restricted review. Treat the member selection as an allegation, inspect only authorized evidence, and record an audited disposition.'
                : 'Review the authorized evidence, confirm the policy classification, and record a proportionate audited decision within the 24-hour target.',
            bullets: [
              'Claim the case before deciding so ownership is visible.',
              'Keep reporter identity and protected evidence inside the admin portal.',
              'Use the case history for rationale, escalation, and final disposition.',
            ],
          },
        ],
        actions: [{ label: 'Open Doji Admin', href: ADMIN_PORTAL_URL }],
        reference: reportId,
        footerNote:
          'Confidential Doji administrator alert. Do not forward reporter identity or protected evidence.',
      });
      subject = `${tone === 'critical' ? '[CRITICAL]' : '[Action required]'} ${categoryLabel}: ${detailLabel} · Doji`;
      html = template.html;
      text = template.text;
      idempotencyKey = `admin-report/${reportId}`;
    } else if (event === 'operational_health') {
      const issueFamily = String(payload.issue_family ?? 'health-degraded')
        .replace(/[^a-z0-9:_-]/gi, '-')
        .slice(0, 120);
      const { data: claimedReceipt, error: receiptError } = await supabase.rpc(
        'claim_operational_alert_delivery',
        { p_issue_family: issueFamily, p_payload: payload },
      );
      if (receiptError)
        throw new Error(`Operational alert receipt failed: ${receiptError.message}`);
      operationalReceiptKey = typeof claimedReceipt === 'string' ? claimedReceipt : null;
      if (!operationalReceiptKey) {
        return new Response(JSON.stringify({ ok: true, deduplicated: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const guidance = operationalGuidance(issueFamily, payload);
      const observedAt = formatEmailTimestamp(payload.observed_at ?? payload.checked_at);
      const immediate =
        Boolean(payload.immediate) ||
        issueFamily.includes('exhausted') ||
        issueFamily.includes('credentials') ||
        issueFamily.includes('failure');
      const tone: DojiEmailTone = immediate ? 'critical' : 'danger';
      const familyLabel = humanizeEmailToken(issueFamily);
      const template = renderDojiEmail({
        preheader: `${familyLabel} detected in production at ${observedAt}`,
        eyebrow: immediate
          ? 'Production incident · immediate attention'
          : 'Production health · action required',
        title: 'Doji needs attention',
        summary: guidance.meaning,
        tone,
        statusLabel: immediate ? 'Immediate review' : 'Sustained degradation',
        facts: [
          { label: 'Issue family', value: familyLabel },
          { label: 'Observed', value: observedAt },
          { label: 'Source', value: humanizeEmailToken(payload.source ?? 'doji-orchestrator') },
          ...operationalFacts(payload),
        ],
        sections: [
          {
            heading: 'Recommended response',
            bullets: guidance.steps,
          },
          {
            heading: 'Alert behavior',
            body: 'This incident family is deduplicated to one administrator email per rolling hour. Durable application state remains in Postgres; never infer data loss from notification or socket delivery alone.',
          },
        ],
        actions: [{ label: 'Open Platform operations', href: ADMIN_PORTAL_URL }],
        reference: operationalReceiptKey ?? issueFamily,
        footerNote:
          'Confidential Doji operations alert. Metrics are content-free and safe for authorized administrators only.',
      });
      subject = `${immediate ? '[INCIDENT]' : '[Degraded]'} ${familyLabel} · Doji production`;
      html = template.html;
      text = template.text;
      idempotencyKey = operationalReceiptKey ? `operational-alert/${operationalReceiptKey}` : null;
    } else {
      return new Response(JSON.stringify({ error: 'Unknown event type' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const res = await fetchWithTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: [ADMIN_EMAIL], subject, html, text }),
    });

    const result = await res.json();

    if (!res.ok) {
      if (operationalReceiptKey) {
        await supabase
          .from('operational_alert_deliveries')
          .delete()
          .eq('idempotency_key', operationalReceiptKey);
      }
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
    if (operationalReceiptKey) {
      await supabase
        .from('operational_alert_deliveries')
        .delete()
        .eq('idempotency_key', operationalReceiptKey);
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('send-admin-email error:', err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
