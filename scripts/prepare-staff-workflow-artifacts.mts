// Local-only overlay. Preserve every non-preview live asset and auth dependency.
import assert from 'node:assert/strict';
import { readFile, writeFile, cp, mkdir, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { hash, inventory } from './prepare-safety-launch.mts';
import { evidenceRecord, evidenceAssets } from './release-evidence.mts';
import { runtimeSourceClosure } from './business-runtime-source-closure.mts';
const root = 'test-results/staff-workflow-release',
  slug = 'supabase/functions/employee-portal-v2';
assert.equal(process.argv.length, 2);
const candidate = evidenceRecord(JSON.parse(await readFile(`${root}/candidate.json`, 'utf8')));
await assert.rejects(access(`${root}/artifacts.json`));
assert.deepEqual(await inventory(`${root}/site-before`), candidate.baseAssets);
assert.deepEqual(await inventory(`${root}/edge-before`), candidate.edgeBefore);
await cp(`${root}/edge-before`, `${root}/edge-after`, {
  recursive: true,
  errorOnExist: true,
  force: false,
});
// Only workflow adapter/resources/SQL and their new pure contracts are compiled.
// Keep the deployed provider, HTTP, session, admission, proxy, timing and signing code exact.
const changed = [
  'employee-application-adapter',
  'employee-resources',
  'restricted-sql',
  'employee-workflow-contracts',
  'portal-contracts',
];
for (const name of changed) {
  const result = ts.transpileModule(
    await readFile(`infra/portal-identity-candidate/${name}.mts`, 'utf8'),
    {
      fileName: name + '.mts',
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        rewriteRelativeImportExtensions: true,
        newLine: ts.NewLineKind.LineFeed,
      },
    },
  );
  assert.ok(!result.diagnostics?.some((d) => d.category === ts.DiagnosticCategory.Error));
  await writeFile(`${root}/edge-after/${slug}/runtime/${name}.mjs`, result.outputText);
}
// Add only the opt-in property to the exact deployed runtime; no auth rewrite.
const runtimePath = `${root}/edge-after/${slug}/runtime/employee-runtime.mjs`;
const runtime = await readFile(runtimePath, 'utf8'),
  needle = '  const application = createEmployeeResources(adapter, {\n';
assert.equal(runtime.split(needle).length, 2);
await writeFile(
  runtimePath,
  runtime.replace(
    needle,
    needle + '    staffWorkflowEnabled: policy.staffWorkflowEnabled === true,\n',
  ),
);
for (const dir of ['edge-before', 'edge-after'])
  await writeFile(
    `${root}/${dir}/supabase/config.toml`,
    'project_id = "staff-workflow-preview"\n[functions.employee-portal-v2]\nverify_jwt = false\n',
  );
await runtimeSourceClosure(`${root}/edge-after/${slug}`, 'index.ts');
// Same stored runtime config/keys. Gate remains false until a separate enable artifact.
const oldBundle = await readFile(`${root}/site-before/admin-portal/admin-app-20261002d.js`, 'utf8');
const match = oldBundle.match(/window\.DOJI_PORTAL_CONFIG = Object\.freeze\((\{[\s\S]*?\})\);/);
assert.ok(match?.[1]);
const config = evidenceRecord(JSON.parse(match[1]));
assert.equal(config.independentEmployeeIdentity, true);
const buildDir = '.business-admin-qa-20261008';
const env = {
  ...process.env,
  DOJI_ADMIN_OUTPUT_DIR: buildDir,
  DOJI_ADMIN_ASSET_PREFIX: '/identity/employee-preview',
  DOJI_ADMIN_SUPABASE_URL: String(config.supabaseUrl),
  DOJI_ADMIN_SUPABASE_ANON_KEY: String(config.supabaseAnonKey),
  DOJI_ADMIN_API_BASE_URL: String(config.apiBaseUrl),
  DOJI_ADMIN_EMPLOYEE_ACCOUNTS: 'true',
  DOJI_ADMIN_INDEPENDENT_EMPLOYEE: 'true',
  DOJI_ADMIN_STAFF_WORKFLOW_ENABLED: 'true',
  DOJI_ADMIN_EDITORIAL_ENABLED: String(config.editorialEnabled),
  DOJI_ADMIN_BUSINESS_APPLICATIONS_ENABLED: String(config.businessApplicationsEnabled),
  DOJI_ADMIN_SAFETY_REMOVAL_ENABLED: String(config.safetyRemovalEnabled),
  DOJI_ADMIN_BUSINESS_PRIVACY_ENABLED: String(config.businessPrivacyEnabled),
  DOJI_ADMIN_CAMPAIGNS_ENABLED: String(config.campaignsEnabled),
};
execFileSync(process.execPath, ['website/build-admin.mts'], { env, stdio: 'pipe', timeout: 60000 });
assert.equal(config.safetyRemovalEnabled, true);
assert.equal(config.businessPrivacyEnabled, true);
await cp(`${root}/site-before`, `${root}/site-after`, {
  recursive: true,
  errorOnExist: true,
  force: false,
});
const prefix = 'identity/employee-preview/';
for (const f of await inventory(`website/${buildDir}`)) {
  if (f.path.startsWith('_') || f.path === 'robots.txt') continue;
  const target = `${root}/site-after/${prefix}${f.path}`;
  await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true });
  await cp(`website/${buildDir}/${f.path}`, target);
}
const after = await inventory(`${root}/site-after`);
for (const f of evidenceAssets(candidate.baseAssets))
  if (!f.path.startsWith(prefix))
    assert.equal(
      after.find((a) => a.path === f.path)?.sha256,
      f.sha256,
      `Live root changed: ${f.path}`,
    );
const edge = await inventory(`${root}/edge-after`);
const allow = new Set([
  ...changed.map((n) => `${slug}/runtime/${n}.mjs`),
  `${slug}/runtime/employee-runtime.mjs`,
  'supabase/config.toml',
]);
for (const f of evidenceAssets(candidate.edgeBefore))
  if (!allow.has(f.path))
    assert.equal(
      edge.find((a) => a.path === f.path)?.sha256,
      f.sha256,
      `Auth dependency changed: ${f.path}`,
    );
await writeFile(
  `${root}/artifacts.json`,
  JSON.stringify(
    {
      at: new Date().toISOString(),
      site: after,
      edge,
      edgeBefore: await inventory(`${root}/edge-before`),
      changedRuntime: [...allow],
      rootAssetsPreserved: true,
      workerPreserved: true,
      previewPrefix: prefix,
      flags: { safety: config.safetyRemovalEnabled, privacy: config.businessPrivacyEnabled },
      runtimeGate: false,
      sourceHashes: await Promise.all(
        changed.map(async (name) => ({
          path: `infra/portal-identity-candidate/${name}.mts`,
          sha256: hash(await readFile(`infra/portal-identity-candidate/${name}.mts`)),
        })),
      ),
    },
    null,
    2,
  ),
  { flag: 'wx' },
);
console.log(
  'Prepared exact preview overlay; current homepage/Worker and deployed auth/session dependencies preserved. Runtime workflow gate remains false.',
);
