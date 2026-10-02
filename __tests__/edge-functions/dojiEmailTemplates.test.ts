import fs from 'node:fs';
import path from 'node:path';
import { formatEmailTimestamp, renderDojiEmail } from '../../supabase/functions/_shared/doji-email';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('Doji transactional email system', () => {
  it('renders a responsive branded HTML message and a complete plain-text fallback', () => {
    const message = renderDojiEmail({
      preheader: 'Critical report awaiting review',
      eyebrow: 'Trust & safety',
      title: 'A critical report needs you',
      summary: 'Review the allegation and authorized evidence.',
      tone: 'critical',
      statusLabel: 'Immediate review',
      facts: [
        { label: 'Specific concern', value: 'Credible threat' },
        { label: 'Report ID', value: 'report-123', monospace: true },
      ],
      sections: [{ heading: 'Next step', bullets: ['Claim the case', 'Record a decision'] }],
      actions: [{ label: 'Open Doji Admin', href: 'https://admin.dojipro.com/' }],
      reference: 'report-123',
    });

    expect(message.html).toContain('<!doctype html>');
    expect(message.html).toContain('x-apple-disable-message-reformatting');
    expect(message.html).toContain('prefers-color-scheme: dark');
    expect(message.html).toContain('A critical report needs you');
    expect(message.html).toContain('https://admin.dojipro.com/');
    expect(message.text).toContain('Specific concern: Credible threat');
    expect(message.text).toContain('Reference: report-123');
  });

  it('escapes untrusted content and blocks unsafe action schemes', () => {
    const message = renderDojiEmail({
      preheader: '<script>alert(1)</script>',
      eyebrow: 'Notice',
      title: '<img src=x onerror=alert(1)>',
      summary: 'A & B',
      facts: [{ label: 'Reporter context', value: '<b>unsafe</b>' }],
      actions: [{ label: 'Unsafe', href: 'javascript:alert(1)' }],
    });

    expect(message.html).not.toContain('<script>alert(1)</script>');
    expect(message.html).not.toContain('<img src=x');
    expect(message.html).not.toContain('javascript:alert(1)');
    expect(message.html).toContain('&lt;b&gt;unsafe&lt;/b&gt;');
    expect(message.html).toContain('A &amp; B');
  });

  it('formats delivery timestamps deterministically in UTC', () => {
    expect(formatEmailTimestamp('2026-09-25T13:45:00.000Z')).toContain('Sep 25, 2026');
    expect(formatEmailTimestamp('2026-09-25T13:45:00.000Z')).toContain('UTC');
    expect(formatEmailTimestamp('not-a-date')).toBe('Not available');
  });

  it('uses the shared system for member notices and administrator action alerts', () => {
    const admin = read('supabase/functions/send-admin-email/index.ts');
    const relay = read('supabase/functions/relay-domain-events/index.ts');
    const migration = read('supabase/migrations/20260925135000_enrich_admin_report_email.sql');

    expect(admin).toContain('renderDojiEmail');
    expect(admin).toContain('idempotencyKey = `admin-report/${reportId}`');
    expect(admin).toContain('text = template.text');
    expect(relay).toContain('renderDojiEmail');
    expect(relay).toContain("'Idempotency-Key': `moderation-decision/${copy.decisionId}`");
    expect(relay).toContain('text: template.text');
    expect(migration).toContain("'reason_detail', new.reason_detail");
    expect(migration).toContain("'target_kind', new.target_kind");
    expect(migration).not.toContain('media_path');
  });
});
