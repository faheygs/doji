// Build only local synthetic test artifacts. No private env file, deployment,
// provider configuration or real account is needed or changed.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { instrument, eligible } from './coverage-instrument.mts';
import { inventory } from './check-coverage.mts';
import { adminBundlePath } from './admin-bundle-path.mts';
import { buildBusinessIdentity } from '../website/build-business-identity.mts';
import { prepareStaffWorkflowBrowser } from './prepare-staff-workflow-browser.mts';
import {
  browserAssetPath,
  browserSourcePath,
  compileBrowserSource,
  readBrowserSource,
} from '../website/browser-source.mts';
const root = path.resolve(import.meta.dirname, '..');
const website = path.join(root, 'website');
const admin = path.join(website, '.business-admin-qa-20261002');
const result = spawnSync(process.execPath, ['website/build-admin.mts'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    DOJI_ADMIN_OUTPUT_DIR: '.business-admin-qa-20261002',
    // Public origin is needed for packaged CSP parity; key is synthetic and all
    // non-loopback browser network is blocked or explicitly mocked in fixtures.
    DOJI_ADMIN_SUPABASE_URL: 'https://tvixsmqxotuvyjqzmjla.supabase.co',
    DOJI_ADMIN_SUPABASE_ANON_KEY: 'coverage-fixture-not-a-key',
    DOJI_ADMIN_API_BASE_URL: 'https://doji-orchestrator.faheygs.workers.dev',
    DOJI_ADMIN_EMPLOYEE_ACCOUNTS: 'true',
    DOJI_ADMIN_INDEPENDENT_EMPLOYEE: 'false',
    DOJI_ADMIN_STAFF_WORKFLOW_ENABLED: 'false',
    DOJI_ADMIN_ASSET_PREFIX: '',
    DOJI_ADMIN_EDITORIAL_ENABLED: 'true',
    DOJI_ADMIN_CAMPAIGNS_ENABLED: 'true',
    DOJI_ADMIN_SAFETY_REMOVAL_ENABLED: 'true',
    DOJI_ADMIN_BUSINESS_APPLICATIONS_ENABLED: 'true',
    DOJI_ADMIN_BUSINESS_PRIVACY_ENABLED: 'true',
  },
});
if (result.status !== 0) process.exit(result.status || 1);
const bundle = path.join(
  admin,
  adminBundlePath(fs.readFileSync(path.join(admin, 'index.html'), 'utf8')),
);
let content = fs.readFileSync(bundle, 'utf8');
for (const relative of [
  'admin-portal/auth-journey.js',
  'admin-portal/record-pages.js',
  'admin-portal/health-model.js',
  'admin-portal/live-client.js',
  'admin-portal/contextual-help.js',
  'admin-portal/editorial.js',
  'admin-portal/safety-removal.js',
  'portal-select.js',
  'portal.js',
]) {
  const sourcePath = browserSourcePath(relative);
  const source = readBrowserSource(relative);
  if (!content.includes(source)) throw Error(`Missing bundled source: ${relative}`);
  content = content.replace(source, () =>
    compileBrowserSource(
      relative,
      instrument(fs.readFileSync(sourcePath, 'utf8'), sourcePath).code,
    ),
  );
}
fs.writeFileSync(bundle, content);
const publicRoot = path.join(root, 'test-results/coverage/current/public-site');
fs.mkdirSync(publicRoot, { recursive: true });
for (const relative of [
  '_headers',
  'styles.css',
  'portal.css',
  'assets',
  'business-portal',
  'safety-removal',
  'employee-setup',
  'identity',
]) {
  fs.cpSync(path.join(website, relative), path.join(publicRoot, relative), {
    recursive: true,
    filter: (source) =>
      !/[/\\](?:e2e|test-results|node_modules|browser-test-output)(?:[/\\]|$)/.test(source) &&
      !/\.(?:mts|cts)$/.test(source),
  });
}
// Legacy shared-form contract specs mount the admin renderer on the local
// business test page. These extra files never enter a deployed business build.
fs.mkdirSync(path.join(publicRoot, 'admin-portal'), { recursive: true });
fs.copyFileSync(
  path.join(website, 'admin-portal/admin.css'),
  path.join(publicRoot, 'admin-portal/admin.css'),
);
// Match the public preview's reviewed CAPTCHA policy without relaxing admin CSP.
const publicHeaders = fs
  .readFileSync(path.join(publicRoot, '_headers'), 'utf8')
  .replace("script-src 'self'", "script-src 'self' https://challenges.cloudflare.com")
  .replace('; base-uri', '; frame-src https://challenges.cloudflare.com; base-uri');
fs.writeFileSync(path.join(publicRoot, '_headers'), publicHeaders);
for (const relative of inventory().filter((file) => file.startsWith('website/'))) {
  // These maintained sources are instrumented in their dedicated bundled artifact below.
  if (relative.startsWith('website/business-portal/identity/')) continue;
  const sourcePath = path.join(root, relative);
  if (!eligible(sourcePath)) continue;
  const name = browserAssetPath(path.relative(website, sourcePath));
  const code = compileBrowserSource(
    name,
    instrument(fs.readFileSync(sourcePath, 'utf8'), sourcePath).code,
  );
  const publicTarget = path.join(publicRoot, name);
  fs.mkdirSync(path.dirname(publicTarget), { recursive: true });
  fs.writeFileSync(publicTarget, code);
  const adminTarget = path.join(admin, name);
  if (fs.existsSync(adminTarget)) fs.writeFileSync(adminTarget, code);
}
await buildBusinessIdentity(
  path.join(root, 'test-results/coverage/current/business-identity-site'),
  {
    enabled: true,
    origin: 'https://business.dojipro.com',
    turnstileSiteKey: 'synthetic-browser-fixture',
    termsVersion: 'business-terms-20260930-v1',
    privacyVersion: 'business-privacy-20260930-v1',
    termsUrl: 'https://business.dojipro.com/business-terms/',
    privacyUrl: 'https://business.dojipro.com/business-privacy/',
  },
  true,
);
console.log('Prepared instrumented local admin/business/safety test artifacts.');
prepareStaffWorkflowBrowser(true);
// The prefixed-route regression needs its own generated asset prefix. Never
// depend on an ignored preview directory left behind by a previous local run.
prepareStaffWorkflowBrowser(true, true);
