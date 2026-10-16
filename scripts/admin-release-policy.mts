import assert from 'node:assert/strict';
import { stagingFlags, stagingHeaders } from './build-admin-staging.mts';

export type AdminTarget = 'staging' | 'production';
export const productionFlags = Object.freeze({
  independentEmployeeIdentity: true,
  staffWorkflowEnabled: true,
  businessApplicationsEnabled: true,
  businessPrivacyEnabled: true,
  announcementComposeEnabled: true,
  historyReadsEnabled: true,
});
// Preserve the live admin policy; changing integration gates requires a separate release review.
export const productionHeaders = `/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.ably.com; connect-src 'self' https://tvixsmqxotuvyjqzmjla.supabase.co https://doji-orchestrator.faheygs.workers.dev https://*.ably.io wss://*.ably.io https://*.ably.net wss://*.ably.net https://*.ably-realtime.com wss://*.ably-realtime.com; media-src 'self' https://tvixsmqxotuvyjqzmjla.supabase.co; img-src 'self' data: https://tvixsmqxotuvyjqzmjla.supabase.co; style-src 'self' 'unsafe-inline'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store
`;
export function adminTarget(value: string) {
  assert.ok(value === 'staging' || value === 'production', 'Unknown admin deployment target.');
  return value;
}
export const targets = {
  staging: {
    origin: 'https://admin-staging.dojipro.com',
    pagesProject: 'doji-admin-staging',
    supabaseProject: 'ohrcupagdoilkwhecict',
    flags: stagingFlags,
    headers: stagingHeaders,
  },
  production: {
    origin: 'https://admin.dojipro.com',
    pagesProject: 'doji-admin',
    supabaseProject: 'tvixsmqxotuvyjqzmjla',
    flags: productionFlags,
    headers: productionHeaders,
  },
} as const;

export function affectsAdmin(path: string): boolean {
  // Some business-named contracts are also used by admin's application review.
  return /^(web\/(apps\/admin\/|packages\/|package(-lock)?\.json$|tsconfig\.json$|tests\/connected-artifacts\.ts$)|website\/(admin-portal\/|portal.*\.(mts|css)$|styles\.css$|assets\/doji-icon\.png$|identity\/setup-return\.mts$|browser-source\.mts$|business-portal\/application-form\.mts$)|infra\/portal-identity\/(employee-|bounded-body\.mts$|business-contracts\.mts$|portal-contracts\.mts$)|infra\/doji-orchestrator\/(package(-lock)?\.json$|src\/portal-)|scripts\/(admin-release-|build-admin-|deploy-admin-|test-admin-release)|\.github\/workflows\/(admin-|quality\.yml$)|package(-lock)?\.json$)/.test(
    path,
  );
}

export function trustedRun(run: Record<string, unknown>, path: string, events: string[]) {
  assert.equal(run.path, path, 'Wrong workflow.');
  assert.equal(run.head_branch, 'main');
  assert.equal(run.status, 'completed');
  assert.equal(run.conclusion, 'success', 'Required workflow has not succeeded.');
  assert.ok(events.includes(String(run.event)));
  assert.equal((run.repository as { full_name?: string })?.full_name, 'faheygs/doji');
  assert.equal((run.head_repository as { full_name?: string })?.full_name, 'faheygs/doji');
}
