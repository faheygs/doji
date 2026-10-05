import fs from 'node:fs';
import path from 'node:path';
import { portalRouteFor } from '../../infra/doji-orchestrator/src/portal-read';

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('admin portal operations and presentation contracts', () => {
  it('routes immutable audit pages through a bounded server RPC', () => {
    const route = portalRouteFor(new URL('https://admin.test/portal/admin/audit?limit=50'));
    expect(route?.rpc).toBe('get_admin_audit_page_v2');
    expect(route?.method).toBe('GET');
    const invalid = portalRouteFor(new URL('https://admin.test/portal/admin/audit?limit=500'));
    expect(() => invalid?.args?.(new URL('https://admin.test/portal/admin/audit?limit=500'))).toThrow();
  });

  it('supports server-filtered audit export and super-admin operator controls', () => {
    const audit = portalRouteFor(new URL('https://admin.test/portal/admin/audit?limit=50&category=decision&search=remove'));
    expect(audit?.rpc).toBe('get_admin_audit_page_v2');
    expect(audit?.args?.(new URL('https://admin.test/portal/admin/audit?limit=50&category=decision&search=remove'))).toMatchObject({
      p_category: 'decision',
      p_search: 'remove',
    });
    expect(portalRouteFor(new URL('https://admin.test/portal/admin/audit-export'))?.rpc).toBe('get_admin_audit_export_v1');
    expect(portalRouteFor(new URL('https://admin.test/portal/admin/operators'))?.rpc).toBe('get_admin_operator_directory_v1');
    expect(portalRouteFor(new URL('https://admin.test/portal/admin/operator-role'))?.rpc).toBe('admin_set_operator_role_v1');
  });

  it('keeps Sentry credentials server-side and exposes only sanitized issue fields', () => {
    const gateway = source('infra/doji-orchestrator/src/portal-read.ts');
    const client = source('website/admin-portal/live-client.mts');
    expect(gateway).toContain("url.pathname === '/portal/admin/platform-health'");
    expect(gateway).toContain('authorization: `Bearer ${env.SENTRY_API_TOKEN}`');
    expect(gateway).toContain('permalink: issue.permalink?.startsWith(\'https://\')');
    expect(client).toContain("platformHealth: () => portalRequest('/portal/admin/platform-health')");
    expect(client).not.toContain('SENTRY_API_TOKEN');
  });

  it('archives completed Doji health through the service monitor and exposes bounded history', () => {
    const edge = source('supabase/functions/operational-health/index.ts');
    const migration = source('supabase/migrations/20260925133000_daily_event_health_history.sql');
    const historyRoute = portalRouteFor(new URL('https://admin.test/portal/admin/platform-health-history?limit=12'));
    expect(edge).toContain("database.rpc('refresh_daily_event_health_snapshots_v1'");
    expect(migration).toContain('create table if not exists public.admin_daily_event_health_snapshots');
    expect(migration).toContain("event_row.closes_at + interval '30 minutes'");
    expect(migration).toContain("auth.role() <> 'service_role'");
    expect(historyRoute?.rpc).toBe('get_admin_event_health_history_v1');
    expect(historyRoute?.method).toBe('GET');
  });

  it('uses semantic decision weights, descriptive close controls, and clickable audit details', () => {
    const portal = source('website/portal.mts');
    const html = source('website/admin-portal/index.html');
    const css = source('website/admin-portal/admin.css');
    expect(portal).toContain("'No violation', 'action-positive'");
    expect(portal).toContain("'Quarantine & escalate', 'action-critical'");
    expect(portal).toContain('openAuditDetail');
    expect(portal).toContain('groupedAuditRows');
    expect(portal).toContain('renderDataHealthBanner');
    expect(portal).toContain('renderOperators');
    expect(html).toContain('aria-label="Close details"');
    expect(html).not.toContain('aria-label="Close">×</button>');
    expect(css).toContain('.portalButton.action-critical');
    expect(css).toContain('.queueTable tbody tr.severity-critical');
  });
});
