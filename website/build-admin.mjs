import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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

function parseEnv(source) {
  return Object.fromEntries(source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const separator = line.indexOf('=');
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
      return [key, value];
    }));
}

// Clean CI builds use explicit public fixture values and never need a private env file.
const localEnv = process.env.DOJI_ADMIN_SUPABASE_URL && process.env.DOJI_ADMIN_SUPABASE_ANON_KEY
  ? {} : parseEnv(await readFile(join(repositoryRoot, '.env.local'), 'utf8'));
const supabaseUrl = process.env.DOJI_ADMIN_SUPABASE_URL || localEnv.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.DOJI_ADMIN_SUPABASE_ANON_KEY || localEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const apiBaseUrl = process.env.DOJI_ADMIN_API_BASE_URL
  || 'https://doji-orchestrator.faheygs.workers.dev';
// Employee cutover is live. Legacy mode must be an explicit rollback/test choice.
const employeeAccountsEnabled = process.env.DOJI_ADMIN_EMPLOYEE_ACCOUNTS !== 'false';
// Remains off until the independent runtime, owner mapping and acceptance are verified.
const independentEmployeeIdentity = process.env.DOJI_ADMIN_INDEPENDENT_EMPLOYEE === 'true';
const assetPrefix = process.env.DOJI_ADMIN_ASSET_PREFIX || '';
if (assetPrefix && (!independentEmployeeIdentity || assetPrefix !== '/identity/employee-preview')) {
  throw new Error('Only the reviewed independent employee preview asset prefix is allowed.');
}
if (independentEmployeeIdentity && !employeeAccountsEnabled) throw new Error('Independent identity requires employee mode.');
// Opt-in only after additive backend contracts have a separately approved release.
const editorialEnabled = process.env.DOJI_ADMIN_EDITORIAL_ENABLED === 'true';
// Independently gated until the campaign DB contracts have a reviewed release.
const campaignsEnabled = process.env.DOJI_ADMIN_CAMPAIGNS_ENABLED === 'true';
const safetyRemovalEnabled = process.env.DOJI_ADMIN_SAFETY_REMOVAL_ENABLED === 'true';
const businessApplicationsEnabled = process.env.DOJI_ADMIN_BUSINESS_APPLICATIONS_ENABLED === 'true';
const businessPrivacyEnabled = process.env.DOJI_ADMIN_BUSINESS_PRIVACY_ENABLED === 'true';

if (!supabaseUrl || !supabaseAnonKey || !apiBaseUrl) {
  throw new Error('Admin deployment requires the public Supabase URL, anon key, and API base URL.');
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await cp(join(websiteRoot, 'assets'), join(outputRoot, 'assets'), { recursive: true });
await mkdir(join(outputRoot, 'admin-portal'), { recursive: true });
for (const file of ['index.html', 'admin.css', 'live-client.js']) {
  await cp(join(websiteRoot, 'admin-portal', file), join(outputRoot, 'admin-portal', file));
}

for (const file of ['styles.css', 'portal.css', 'portal.js', 'theme-init.js', '_headers']) {
  await cp(join(websiteRoot, file), join(outputRoot, file));
}
await cp(join(websiteRoot, 'admin-portal', 'index.html'), join(outputRoot, 'index.html'));
await cp(join(websiteRoot, 'employee-setup'), join(outputRoot, 'employee-setup'), { recursive: true });
if (businessPrivacyEnabled) {
  await cp(join(websiteRoot, 'admin-portal/business-privacy.js'), join(outputRoot, 'admin-portal/business-privacy.js'));
}
if (businessApplicationsEnabled || businessPrivacyEnabled) {
  await cp(join(websiteRoot, 'admin-portal/business-applications.js'), join(outputRoot, 'admin-portal/business-applications.js'));
  await mkdir(join(outputRoot, 'business-portal'), { recursive: true });
  // Shared safe field renderer only, never public/business pages or their auth config.
  await cp(join(websiteRoot, 'business-portal/application-form.js'), join(outputRoot, 'business-portal/application-form.js'));
}
// Admin-only video evidence; do not widen the public/business site's policy.
const adminHeaders = (await readFile(join(outputRoot, '_headers'), 'utf8'))
  .replace("; img-src", `; media-src 'self' ${new URL(supabaseUrl).origin}; img-src`);
await writeFile(join(outputRoot, '_headers'), `${adminHeaders}\n/employee-setup/*\n  Cache-Control: no-store\n`);
await writeFile(join(outputRoot, 'employee-setup/config.js'), `window.DOJI_EMPLOYEE_SETUP_CONFIG = Object.freeze(${JSON.stringify({ supabaseUrl, supabaseAnonKey, employeePortalEnabled: employeeAccountsEnabled })});\n`);
await writeFile(join(outputRoot, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');
const portalConfigSource = `window.DOJI_PORTAL_CONFIG = Object.freeze(${JSON.stringify({
    mode: 'live',
    employeeAccountsEnabled,
    independentEmployeeIdentity,
    editorialEnabled,
    campaignsEnabled,
    safetyRemovalEnabled,
    businessApplicationsEnabled,
    businessPrivacyEnabled,
    supabaseUrl,
    supabaseAnonKey,
    apiBaseUrl,
  }, null, 2)});\n`;
const [liveClientSource, portalRuntimeSource, healthModelSource, contextualHelpSource, editorialSource, safetyRemovalSource, selectSource] = await Promise.all([
  readFile(join(websiteRoot, 'admin-portal', 'live-client.js'), 'utf8'),
  readFile(join(websiteRoot, 'portal.js'), 'utf8'),
  readFile(join(websiteRoot, 'admin-portal', 'health-model.js'), 'utf8'),
  readFile(join(websiteRoot, 'admin-portal', 'contextual-help.js'), 'utf8'),
  readFile(join(websiteRoot, 'admin-portal', 'editorial.js'), 'utf8'),
  readFile(join(websiteRoot, 'admin-portal', 'safety-removal.js'), 'utf8'),
  readFile(join(websiteRoot, 'portal-select.js'), 'utf8'),
]);
let independentSource = '';
if (independentEmployeeIdentity) {
  const { build } = await import('../infra/doji-orchestrator/node_modules/esbuild/lib/main.js');
  const bundle = await build({
    stdin: { contents: "export { createEmployeeBrowserTransport as create } from './employee-browser-transport.mjs';", resolveDir: join(repositoryRoot, 'infra/portal-identity-candidate') },
    bundle: true, write: false, format: 'iife', globalName: 'DojiEmployeeTransport', platform: 'browser', target: 'es2022',
  });
  independentSource = bundle.outputFiles[0].text;
  await build({ entryPoints: [join(repositoryRoot, 'infra/portal-identity-candidate/employee-pages-worker.mjs')],
    bundle: true, outfile: join(outputRoot, '_worker.js'), format: 'esm', platform: 'neutral', target: 'es2022',
    external: ['node:*'],
  });
  // Never expose the old Supabase account creation page after independent cutover.
  await writeFile(join(outputRoot, '_redirects'), '/employee-setup/* / 302\n');
  await rm(join(outputRoot, 'employee-setup'), { recursive: true, force: true });
  // The legacy return handler belongs only to legacy Supabase employee setup.
  for (const entry of ['index.html', 'admin-portal/index.html']) {
    const path = join(outputRoot, entry);
    let html = (await readFile(path, 'utf8')).replace(/  <script src="\/employee-setup\/return.js"><\/script>\r?\n/, '');
    // Hosted employee recovery only. This callback deliberately does not exchange
    // a code or create a portal session; password + MFA still gate portal access.
    const recovery = new URL('https://api.workos.com/user_management/authorize');
    recovery.search = new URLSearchParams({ response_type: 'code',
      client_id: 'client_01M3VE4WTBYS2XN6NZPH9EDMQD',
      redirect_uri: 'https://admin.dojipro.com/identity/setup-complete',
      provider: 'authkit', screen_hint: 'sign-in', prompt: 'login' }).toString();
    html = html.replace('<button class="portalButton primary" type="submit">Sign in</button>',
      `<button class="portalButton primary" type="submit">Sign in</button>\n          <a class="authBackButton" href="${recovery.href.replaceAll('&', '&amp;')}" rel="noreferrer">Forgot employee password?</a>`);
    if (assetPrefix) html = html.replace(/(src|href)="\/(assets\/|admin-portal\/|styles\.css|portal\.css|theme-init\.js)/g, `$1="${assetPrefix}/$2`);
    await writeFile(path, html);
  }
}
await writeFile(
  join(outputRoot, 'admin-portal', 'admin-app-20260925ap.js'),
  `${portalConfigSource}\n${independentSource}\n${healthModelSource}\n${liveClientSource}\n${contextualHelpSource}\n${editorialSource}\n${safetyRemovalSource}\n${selectSource}\n${assetPrefix ? portalRuntimeSource.replaceAll("import('/admin-portal/", `import('${assetPrefix}/admin-portal/`) : portalRuntimeSource}\n`,
  'utf8',
);

console.log(`Built isolated admin portal at ${outputRoot}`);
