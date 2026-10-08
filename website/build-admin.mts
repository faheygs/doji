import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBrowserSource } from './browser-source.mts';
import { prefixAdminImports } from './prefix-admin-imports.mts';
import { versionAdminWorkflow } from './version-admin-workflow.mts';

const websiteRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = dirname(websiteRoot);
const outputName = process.env.DOJI_ADMIN_OUTPUT_DIR || '.admin-dist';
if (outputName !== '.admin-dist' && !/^\.business-admin-qa-\d{8}$/.test(outputName)) {
  throw new Error('Admin output must be the default artifact or a named business QA artifact.');
}
const outputRoot = resolve(websiteRoot, outputName);

if (!outputRoot.startsWith(`${resolve(websiteRoot)}${sep}`)) {
  throw new Error('Admin build output escaped the website directory.');
}

function parseEnv(source: string): Record<string, string> {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        const key = line.slice(0, separator).trim();
        const value = line
          .slice(separator + 1)
          .trim()
          .replace(/^['"]|['"]$/g, '');
        return [key, value];
      }),
  );
}

// Clean CI builds use explicit public fixture values and never need a private env file.
const localEnv: Record<string, string> =
  process.env.DOJI_ADMIN_SUPABASE_URL && process.env.DOJI_ADMIN_SUPABASE_ANON_KEY
    ? {}
    : parseEnv(await readFile(join(repositoryRoot, '.env.local'), 'utf8'));
const supabaseUrl = process.env.DOJI_ADMIN_SUPABASE_URL || localEnv.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.DOJI_ADMIN_SUPABASE_ANON_KEY || localEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const apiBaseUrl =
  process.env.DOJI_ADMIN_API_BASE_URL || 'https://doji-orchestrator.faheygs.workers.dev';
// Employee cutover is live. Legacy mode must be an explicit rollback/test choice.
const employeeAccountsEnabled = process.env.DOJI_ADMIN_EMPLOYEE_ACCOUNTS !== 'false';
// Remains off until the independent runtime, owner mapping and acceptance are verified.
const independentEmployeeIdentity = process.env.DOJI_ADMIN_INDEPENDENT_EMPLOYEE === 'true';
const assetPrefix = process.env.DOJI_ADMIN_ASSET_PREFIX || '';
if (assetPrefix && (!independentEmployeeIdentity || assetPrefix !== '/identity/employee-preview')) {
  throw new Error('Only the reviewed independent employee preview asset prefix is allowed.');
}
if (independentEmployeeIdentity && !employeeAccountsEnabled)
  throw new Error('Independent identity requires employee mode.');
// Opt-in only after additive backend contracts have a separately approved release.
const editorialEnabled = process.env.DOJI_ADMIN_EDITORIAL_ENABLED === 'true';
// Independently gated until the campaign DB contracts have a reviewed release.
const campaignsEnabled = process.env.DOJI_ADMIN_CAMPAIGNS_ENABLED === 'true';
const safetyRemovalEnabled = process.env.DOJI_ADMIN_SAFETY_REMOVAL_ENABLED === 'true';
const businessApplicationsEnabled = process.env.DOJI_ADMIN_BUSINESS_APPLICATIONS_ENABLED === 'true';
const businessPrivacyEnabled = process.env.DOJI_ADMIN_BUSINESS_PRIVACY_ENABLED === 'true';
const staffWorkflowEnabled = process.env.DOJI_ADMIN_STAFF_WORKFLOW_ENABLED === 'true';
const healthEventsEnabled = process.env.DOJI_ADMIN_HEALTH_EVENTS_ENABLED === 'true';
if (healthEventsEnabled && !independentEmployeeIdentity)
  throw Error('Health events require independent employee identity.');
const unifiedSafetyEnabled = process.env.DOJI_ADMIN_UNIFIED_SAFETY_ENABLED === 'true';
if (unifiedSafetyEnabled && (!staffWorkflowEnabled || !safetyRemovalEnabled))
  throw Error('Unified safety requires staff workflow and safety review gates.');
if (
  staffWorkflowEnabled &&
  (!independentEmployeeIdentity || !businessApplicationsEnabled || !editorialEnabled)
)
  throw Error('Staff workflow requires independent employee, business review and editorial gates.');

if (!supabaseUrl || !supabaseAnonKey || !apiBaseUrl) {
  throw new Error('Admin deployment requires the public Supabase URL, anon key, and API base URL.');
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await cp(join(websiteRoot, 'assets'), join(outputRoot, 'assets'), { recursive: true });
await mkdir(join(outputRoot, 'admin-portal'), { recursive: true });
for (const file of ['index.html', 'admin.css', 'live-client.js']) {
  if (file.endsWith('.js'))
    await writeFile(
      join(outputRoot, 'admin-portal', file),
      prefixAdminImports(readBrowserSource(`admin-portal/${file}`), assetPrefix),
    );
  else await cp(join(websiteRoot, 'admin-portal', file), join(outputRoot, 'admin-portal', file));
}

for (const file of ['styles.css', 'portal.css', 'portal.js', 'theme-init.js', '_headers']) {
  if (file.endsWith('.js')) await writeFile(join(outputRoot, file), readBrowserSource(file));
  else await cp(join(websiteRoot, file), join(outputRoot, file));
}
await cp(join(websiteRoot, 'admin-portal', 'index.html'), join(outputRoot, 'index.html'));
await cp(join(websiteRoot, 'employee-setup'), join(outputRoot, 'employee-setup'), {
  recursive: true,
  filter: (source) => !source.endsWith('.mts'),
});
await writeFile(
  join(outputRoot, 'employee-setup/return.js'),
  readBrowserSource('employee-setup/return.js'),
);
await writeFile(
  join(outputRoot, 'employee-setup/setup.js'),
  readBrowserSource('employee-setup/setup.js'),
);
if (businessPrivacyEnabled) {
  await writeFile(
    join(outputRoot, 'admin-portal/business-privacy.js'),
    readBrowserSource('admin-portal/business-privacy.js'),
  );
}
if (staffWorkflowEnabled) {
  for (const name of [
    'workflow-contracts',
    'workflow-case',
    'workflow-workspace',
    'workflow-view',
    'workflow-review',
    'workflow-events',
  ])
    await writeFile(
      join(outputRoot, `admin-portal/${name}.js`),
      readBrowserSource(`admin-portal/${name}.js`),
    );
}
if (businessApplicationsEnabled || businessPrivacyEnabled) {
  await writeFile(
    join(outputRoot, 'admin-portal/business-applications.js'),
    readBrowserSource('admin-portal/business-applications.js'),
  );
  await mkdir(join(outputRoot, 'business-portal'), { recursive: true });
  // Shared safe field renderer only, never public/business pages or their auth config.
  await writeFile(
    join(outputRoot, 'business-portal/application-form.js'),
    readBrowserSource('business-portal/application-form.js'),
  );
}
// Admin-only video evidence; do not widen the public/business site's policy.
const adminHeaders = (await readFile(join(outputRoot, '_headers'), 'utf8')).replace(
  '; img-src',
  `; media-src 'self' ${new URL(supabaseUrl).origin}; img-src`,
);
await writeFile(
  join(outputRoot, '_headers'),
  `${adminHeaders}\n/employee-setup/*\n  Cache-Control: no-store\n`,
);
await writeFile(
  join(outputRoot, 'employee-setup/config.js'),
  `window.DOJI_EMPLOYEE_SETUP_CONFIG = Object.freeze(${JSON.stringify({ supabaseUrl, supabaseAnonKey, employeePortalEnabled: employeeAccountsEnabled })});\n`,
);
await writeFile(join(outputRoot, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');
const portalConfigSource = `window.DOJI_PORTAL_CONFIG = Object.freeze(${JSON.stringify(
  {
    mode: 'live',
    employeeAccountsEnabled,
    independentEmployeeIdentity,
    editorialEnabled,
    campaignsEnabled,
    safetyRemovalEnabled,
    businessApplicationsEnabled,
    businessPrivacyEnabled,
    staffWorkflowEnabled,
    healthEventsEnabled,
    unifiedSafetyEnabled,
    supabaseUrl,
    supabaseAnonKey,
    apiBaseUrl,
  },
  null,
  2,
)});\n`;
const [
  liveClientSource,
  portalRuntimeSource,
  healthModelSource,
  contextualHelpSource,
  editorialSource,
  safetyRemovalSource,
  selectSource,
  authJourneySource,
  recordPagesSource,
] = await Promise.all([
  readBrowserSource('admin-portal/live-client.js'),
  readBrowserSource('portal.js'),
  readBrowserSource('admin-portal/health-model.js'),
  readBrowserSource('admin-portal/contextual-help.js'),
  readBrowserSource('admin-portal/editorial.js'),
  readBrowserSource('admin-portal/safety-removal.js'),
  readBrowserSource('portal-select.js'),
  readBrowserSource('admin-portal/auth-journey.js'),
  readBrowserSource('admin-portal/record-pages.js'),
]);
let independentSource = '';
if (independentEmployeeIdentity) {
  const { build } = await import('../infra/doji-orchestrator/node_modules/esbuild/lib/main.js');
  const bundle = await build({
    stdin: {
      contents:
        "export { createEmployeeBrowserTransport as create } from './employee-browser-transport.mts';",
      resolveDir: join(repositoryRoot, 'infra/portal-identity-candidate'),
    },
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'DojiEmployeeTransport',
    platform: 'browser',
    target: 'es2022',
  });
  const output = bundle.outputFiles[0];
  if (!output) throw Error('Missing employee transport bundle');
  independentSource = output.text;
  await build({
    entryPoints: [
      join(repositoryRoot, 'infra/portal-identity-candidate/employee-pages-worker.mts'),
    ],
    bundle: true,
    outfile: join(outputRoot, '_worker.js'),
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    external: ['node:*'],
  });
  // Never expose the old Supabase account creation page after independent cutover.
  await writeFile(join(outputRoot, '_redirects'), '/employee-setup/* / 302\n');
  await rm(join(outputRoot, 'employee-setup'), { recursive: true, force: true });
  // The legacy return handler belongs only to legacy Supabase employee setup.
  for (const entry of ['index.html', 'admin-portal/index.html']) {
    const path = join(outputRoot, entry);
    let html = (await readFile(path, 'utf8')).replace(
      /  <script src="\/employee-setup\/return.js"><\/script>\r?\n/,
      '',
    );
    // Hosted employee recovery only. This callback deliberately does not exchange
    // a code or create a portal session; password + MFA still gate portal access.
    const recovery = new URL('https://api.workos.com/user_management/authorize');
    recovery.search = new URLSearchParams({
      response_type: 'code',
      client_id: 'client_01M3VE4WTBYS2XN6NZPH9EDMQD',
      redirect_uri: 'https://admin.dojipro.com/identity/setup-complete',
      provider: 'authkit',
      screen_hint: 'sign-in',
      prompt: 'login',
    }).toString();
    html = html.replace(
      '<button class="portalButton primary" type="submit">Sign in</button>',
      `<button class="portalButton primary" type="submit">Sign in</button>\n          <a class="authBackButton" href="${recovery.href.replaceAll('&', '&amp;')}" rel="noreferrer">Forgot employee password?</a>`,
    );
    if (assetPrefix)
      html = html.replace(
        /(src|href)="\/(assets\/|admin-portal\/|styles\.css|portal\.css|theme-init\.js)/g,
        `$1="${assetPrefix}/$2`,
      );
    await writeFile(path, html);
  }
}
await writeFile(
  join(outputRoot, 'admin-portal', 'admin-app-20261002d.js'),
  prefixAdminImports(
    `${portalConfigSource}\n${independentSource}\n${healthModelSource}\n${liveClientSource}\n${contextualHelpSource}\n${recordPagesSource}\n${editorialSource}\n${safetyRemovalSource}\n${selectSource}\n${authJourneySource}\n${portalRuntimeSource}\n`,
    assetPrefix,
  ),
  'utf8',
);

if (staffWorkflowEnabled) await versionAdminWorkflow(outputRoot);
console.log(`Built isolated admin portal at ${outputRoot}`);
