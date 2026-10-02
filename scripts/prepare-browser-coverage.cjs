// Build only local synthetic test artifacts. No private env file, deployment,
// provider configuration or real account is needed or changed.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { instrument, eligible } = require('./coverage-instrument.cjs');
const { inventory } = require('./check-coverage.cjs');
const root = path.resolve(__dirname, '..');
const website = path.join(root, 'website');
const admin = path.join(website, '.business-admin-qa-20261002');
const result = spawnSync(process.execPath, ['website/build-admin.mjs'], {
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
    DOJI_ADMIN_ASSET_PREFIX: '',
    DOJI_ADMIN_EDITORIAL_ENABLED: 'true',
    DOJI_ADMIN_CAMPAIGNS_ENABLED: 'true',
    DOJI_ADMIN_SAFETY_REMOVAL_ENABLED: 'true',
    DOJI_ADMIN_BUSINESS_APPLICATIONS_ENABLED: 'true',
    DOJI_ADMIN_BUSINESS_PRIVACY_ENABLED: 'true',
  },
});
if (result.status !== 0) process.exit(result.status || 1);
const bundle = path.join(admin, 'admin-portal/admin-app-20260925ap.js');
let content = fs.readFileSync(bundle, 'utf8');
for (const relative of [
  'admin-portal/health-model.js',
  'admin-portal/live-client.js',
  'admin-portal/contextual-help.js',
  'admin-portal/editorial.js',
  'admin-portal/safety-removal.js',
  'portal-select.js',
  'portal.js',
]) {
  const sourcePath = path.join(website, relative);
  const source = fs.readFileSync(sourcePath, 'utf8');
  if (!content.includes(source)) throw Error(`Missing bundled source: ${relative}`);
  content = content.replace(source, () => instrument(source, sourcePath).code);
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
      !/[/\\](?:e2e|test-results|node_modules|browser-test-output)(?:[/\\]|$)/.test(source),
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
  const sourcePath = path.join(root, relative);
  if (!eligible(sourcePath)) continue;
  const name = path.relative(website, sourcePath);
  const code = instrument(fs.readFileSync(sourcePath, 'utf8'), sourcePath).code;
  const publicTarget = path.join(publicRoot, name);
  fs.mkdirSync(path.dirname(publicTarget), { recursive: true });
  fs.writeFileSync(publicTarget, code);
  const adminTarget = path.join(admin, name);
  if (fs.existsSync(adminTarget)) fs.writeFileSync(adminTarget, code);
}
console.log('Prepared instrumented local admin/business/safety test artifacts.');
