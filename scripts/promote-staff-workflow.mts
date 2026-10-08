// Exact employee-only promotion. Never replay schema installation or other releases.
import assert from 'node:assert/strict';
import { readFile, writeFile, cp, mkdir, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { cli, cf, ref, account, hash, inventory } from './prepare-safety-launch.mts';
import { functions, secrets, pages, linkedWorkspace } from './business-disabled-release-reads.mts';
import {
  evidenceRecord,
  evidenceArray,
  evidenceRows,
  evidenceAssets,
} from './release-evidence.mts';
import {
  contractHash,
  windowGuard,
  assertSecretDigestsUnchanged,
} from './staff-workflow-release-guards.mts';
const root = 'test-results/staff-workflow-release',
  slug = 'employee-portal-v2';
const mode = process.argv[2];
assert.ok(
  ['prepare', 'retire-preview', 'final-style', 'edge', 'site', 'verify'].includes(String(mode)),
);
const read = async (n: string) =>
  evidenceRecord(JSON.parse(await readFile(`${root}/${n}.json`, 'utf8')));
const save = (n: string, v: unknown) =>
  writeFile(`${root}/${n}.json`, JSON.stringify(v, null, 2), { flag: 'wx' });
const query = (sql: string) =>
  evidenceRows(
    cli(['db', 'query', sql, '--linked', '--workdir', linkedWorkspace, '--output-format', 'json']),
  );
const baseline = await read('candidate'),
  preview = await read('preview-verified');
async function guard(version: number, siteChanged = false) {
  const current = functions();
  assert.equal(current.length, evidenceArray(baseline.functions).length);
  for (const old of evidenceArray(baseline.functions)) {
    const next = current.find((f) => f.id === old.id);
    assert.ok(next);
    if (old.slug === slug) assert.equal(next.version, version);
    else assert.deepEqual(next, old);
  }
  assertSecretDigestsUnchanged(secrets(), evidenceArray(baseline.secrets));
  const p = await pages();
  for (const name of ['doji-admin', 'doji-business', 'doji-site']) {
    const project = evidenceRecord(await cf(`/pages/projects/${name}`));
    assert.equal(
      hash(JSON.stringify(project.deployment_configs)),
      evidenceRecord(baseline.configHashes)[name],
    );
    if (name !== 'doji-admin' || !siteChanged)
      assert.deepEqual(p[name], evidenceRecord(preview.pages)[name]);
  }
  const expected = evidenceRecord(baseline.before).hash;
  assert.match(String(expected), /^[a-f0-9]{32}$/);
  query(`begin read only;set local statement_timeout='8s';do $$begin ${windowGuard}
    if (${contractHash})<>'${expected}' then raise exception 'Contract drift';end if;end$$;rollback;`);
  return p;
}
if (mode === 'prepare') {
  await assert.rejects(access(`${root}/promotion-candidate.json`));
  await guard(13);
  const enabled = await read('enable-candidate'),
    routed = await read('routing-candidate');
  assert.deepEqual(await inventory(`${root}/edge-enabled`), enabled.edge);
  assert.deepEqual(await inventory(`${root}/site-routed`), routed.site);
  await cp(`${root}/edge-enabled`, `${root}/edge-role-fixed`, {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
  const changed = `supabase/functions/${slug}/runtime/employee-resources.mjs`;
  const compiled = ts.transpileModule(
    await readFile('infra/portal-identity-candidate/employee-resources.mts', 'utf8'),
    {
      fileName: 'employee-resources.mts',
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        rewriteRelativeImportExtensions: true,
        newLine: ts.NewLineKind.LineFeed,
      },
    },
  );
  assert.ok(!compiled.diagnostics?.some((d) => d.category === ts.DiagnosticCategory.Error));
  await writeFile(`${root}/edge-role-fixed/${changed}`, compiled.outputText);
  const edge = await inventory(`${root}/edge-role-fixed`);
  for (const f of evidenceAssets(enabled.edge))
    if (f.path !== changed) assert.equal(edge.find((x) => x.path === f.path)?.sha256, f.sha256);
  const old = await readFile(
    `${root}/site-routed/identity/employee-preview/admin-portal/admin-app-20261002d.js`,
    'utf8',
  );
  const match = old.match(/window\.DOJI_PORTAL_CONFIG = Object\.freeze\((\{[\s\S]*?\})\);/);
  assert.ok(match?.[1]);
  const config = evidenceRecord(JSON.parse(match[1])),
    buildDir = '.business-admin-qa-20261009';
  const env = {
    ...process.env,
    DOJI_ADMIN_OUTPUT_DIR: buildDir,
    DOJI_ADMIN_ASSET_PREFIX: '',
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
  execFileSync(process.execPath, ['website/build-admin.mts'], {
    env,
    stdio: 'pipe',
    timeout: 60000,
  });
  await cp(`${root}/site-routed`, `${root}/site-promoted`, {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
  const allow = new Set<string>();
  for (const f of await inventory(`website/${buildDir}`)) {
    if (f.path.startsWith('_') || f.path === 'robots.txt' || f.path.startsWith('employee-setup/'))
      continue;
    allow.add(f.path);
    const dest = `${root}/site-promoted/${f.path}`;
    await mkdir(dest.slice(0, dest.lastIndexOf('/')), { recursive: true });
    await cp(`website/${buildDir}/${f.path}`, dest);
  }
  const site = await inventory(`${root}/site-promoted`);
  for (const f of evidenceAssets(routed.site))
    if (!allow.has(f.path)) assert.equal(site.find((x) => x.path === f.path)?.sha256, f.sha256);
  await save('promotion-candidate', {
    at: new Date().toISOString(),
    edge,
    site,
    changedRuntime: changed,
    priorEmployeeVersion: 13,
    priorPages: preview.pages,
    workerPreserved: true,
  });
  console.log(
    'Prepared resource-only employee patch and exact admin root overlay; no production changes.',
  );
} else if (mode === 'retire-preview') {
  // Preparation only: canonical root replaces the old acceptance-only URL.
  const candidate = await read('promotion-candidate');
  assert.deepEqual(await inventory(`${root}/site-promoted`), candidate.site);
  await assert.rejects(access(`${root}/promotion-route-candidate.json`));
  await cp(`${root}/site-promoted`, `${root}/site-promoted-routed`, {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
  const redirects = await readFile(`${root}/site-promoted-routed/_redirects`, 'utf8');
  assert.equal(redirects.trim(), '/employee-setup/* / 302');
  await writeFile(
    `${root}/site-promoted-routed/_redirects`,
    redirects.trim() + '\n/identity/employee-preview/* / 302\n',
  );
  const site = await inventory(`${root}/site-promoted-routed`);
  for (const f of evidenceAssets(candidate.site))
    if (f.path !== '_redirects')
      assert.equal(site.find((x) => x.path === f.path)?.sha256, f.sha256);
  await save('promotion-route-candidate', {
    at: new Date().toISOString(),
    site,
    onlyChanged: '_redirects',
    purpose: 'Retire acceptance preview after main portal promotion',
  });
  console.log('Prepared preview-to-main redirect; every other candidate byte preserved.');
} else if (mode === 'final-style') {
  const routed = await read('promotion-route-candidate');
  assert.deepEqual(await inventory(`${root}/site-promoted-routed`), routed.site);
  await assert.rejects(access(`${root}/promotion-final-candidate.json`));
  await cp(`${root}/site-promoted-routed`, `${root}/site-promoted-final`, {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
  await cp('website/admin-portal/admin.css', `${root}/site-promoted-final/admin-portal/admin.css`);
  const site = await inventory(`${root}/site-promoted-final`);
  for (const f of evidenceAssets(routed.site))
    if (f.path !== 'admin-portal/admin.css')
      assert.equal(site.find((x) => x.path === f.path)?.sha256, f.sha256);
  await save('promotion-final-candidate', {
    at: new Date().toISOString(),
    site,
    onlyChanged: 'admin-portal/admin.css',
    purpose: 'Do not show green health decoration for incomplete telemetry',
  });
  console.log('Prepared final CSS-only health-state correction; other candidate bytes preserved.');
} else {
  assert.equal(process.argv[3], '--approved');
  const candidate = await read('promotion-candidate');
  assert.deepEqual(await inventory(`${root}/edge-role-fixed`), candidate.edge);
  assert.deepEqual(await inventory(`${root}/site-promoted`), candidate.site);
  if (mode === 'edge') {
    await guard(13);
    await save('promotion-edge-started', {
      at: new Date().toISOString(),
      rollback: 'exact edge-enabled employee v13 artifact',
    });
    cli(
      [
        'functions',
        'deploy',
        slug,
        '--project-ref',
        ref,
        '--use-api',
        '--workdir',
        `${root}/edge-role-fixed`,
      ],
      false,
    );
    await guard(14);
    await mkdir(`${root}/role-fixed-verified`, { recursive: true });
    cli(
      [
        'functions',
        'download',
        slug,
        '--project-ref',
        ref,
        '--use-api',
        '--workdir',
        `${root}/role-fixed-verified`,
      ],
      false,
    );
    const actual = await inventory(`${root}/role-fixed-verified`);
    for (const f of evidenceAssets(candidate.edge).filter((f) =>
      f.path.startsWith('supabase/functions/'),
    ))
      assert.equal(actual.find((x) => x.path === f.path)?.sha256, f.sha256);
    await save('promotion-edge-verified', {
      at: new Date().toISOString(),
      employeeVersion: 14,
      sourceVerified: true,
      otherInfrastructureUnchanged: true,
    });
    console.log('Employee v14 verified: only authorized realtime resource handling changed.');
  } else {
    const routed = await read('promotion-final-candidate');
    assert.deepEqual(await inventory(`${root}/site-promoted-final`), routed.site);
    await read('promotion-edge-verified');
    const acceptance = await read('synthetic-acceptance');
    assert.equal(acceptance.passed, true);
    assert.equal(acceptance.cleaned, true);
    if (mode === 'site') {
      await guard(14);
      await save('promotion-site-started', {
        at: new Date().toISOString(),
        rollbackPages: evidenceRecord(preview.pages)['doji-admin'],
      });
      execFileSync(
        process.execPath,
        [
          'infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js',
          'pages',
          'deploy',
          `${root}/site-promoted-final`,
          '--project-name',
          'doji-admin',
          '--branch',
          'main',
          '--commit-dirty=true',
          '--commit-message',
          'Promote accepted unified employee workflow',
        ],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 180000,
          env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
        },
      );
    } else await read('promotion-site-started');
    const p = await guard(14, true);
    assert.notDeepEqual(p['doji-admin'], evidenceRecord(preview.pages)['doji-admin']);
    const checks = [];
    for (const path of [
      'index.html',
      'admin-portal/admin-app-20261002d.js',
      'admin-portal/admin.css',
      'admin-portal/workflow-workspace.js',
      'admin-portal/workflow-view.js',
    ]) {
      const r = await fetch(`https://admin.dojipro.com/${path}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(r.status, 200);
      assert.equal(
        hash(Buffer.from(await r.arrayBuffer())),
        evidenceAssets(routed.site).find((f) => f.path === path)?.sha256,
        path,
      );
      checks.push(path);
    }
    const retired = await fetch('https://admin.dojipro.com/identity/employee-preview/', {
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(retired.status, 302);
    assert.equal(
      new URL(retired.headers.get('location') || '', 'https://admin.dojipro.com').href,
      'https://admin.dojipro.com/',
    );
    for (const [origin, status] of [
      ['https://admin.dojipro.com', 401],
      ['https://business.dojipro.com', 403],
    ] as const) {
      const r = await fetch('https://admin.dojipro.com/api/session', {
        headers: { origin },
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(r.status, status);
    }
    await save('promotion-verified', {
      at: new Date().toISOString(),
      pages: p,
      assetsVerified: checks,
      employeeVersion: 14,
      memberContractsUnchanged: true,
    });
    console.log('Main admin portal promoted; exact assets and access boundaries verified.');
  }
}
