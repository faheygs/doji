import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import stagingWorker from '../infra/portal-identity/employee-staging-pages-worker.mts';
const originalFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = () => {
    throw Error('Unexpected network request in staging package tests.');
  };
});
after(() => {
  globalThis.fetch = originalFetch;
});
import {
  assembleStagingSite,
  reserveOutput,
  stagingFlags,
  stagingHeaders,
  stagingHtml,
} from './build-admin-staging.mts';

const html =
  '<html><head><title>Candidate</title><script src="/react-admin/staging/assets/app.js"></script></head></html>';
test('staging package rejects production bindings and alternate hosts before any upstream access', async () => {
  let reads = 0;
  const origin = 'https://admin-staging.dojipro.com';
  const env = {
    EMPLOYEE_V2_ORIGIN: origin,
    EMPLOYEE_V2_ENDPOINT:
      'https://ohrcupagdoilkwhecict.supabase.co/functions/v1/employee-portal-v2',
    EMPLOYEE_V2_ENABLED: 'false',
    EMPLOYEE_V2_PROXY_KEY: 'ab'.repeat(32),
    ASSETS: {
      fetch: async () => {
        reads++;
        return new Response('synthetic page');
      },
    },
  };
  for (const [url, overrides] of [
    [origin, { EMPLOYEE_V2_ORIGIN: 'https://admin.dojipro.com' }],
    [
      origin,
      {
        EMPLOYEE_V2_ENDPOINT:
          'https://tvixsmqxotuvyjqzmjla.supabase.co/functions/v1/employee-portal-v2',
      },
    ],
    ['https://admin.dojipro.com', {}],
    ['https://preview.doji-admin-staging.pages.dev', {}],
  ] as const)
    assert.equal(
      (await stagingWorker.fetch(new Request(url), { ...env, ...overrides })).status,
      503,
    );
  assert.equal(reads, 0);
  assert.equal((await stagingWorker.fetch(new Request(origin), env)).status, 200);
  assert.equal(reads, 1);
  assert.equal(
    (await stagingWorker.fetch(new Request(origin + '/api/session', { headers: { origin } }), env))
      .status,
    503,
  );
  assert.equal(
    (
      await stagingWorker.fetch(
        new Request(origin + '/identity/setup-complete?code=synthetic'),
        env,
      )
    ).status,
    303,
  );
});
test('staging configuration has no production endpoints, credentials or outbound event gates', () => {
  assert.equal(stagingFlags.independentEmployeeIdentity, true);
  assert.equal(stagingFlags.staffWorkflowEnabled, true);
  assert.equal(stagingFlags.staffWorkflowRealtimeEnabled, false);
  assert.equal(stagingFlags.businessApplicationsEnabled, true);
  assert.equal(stagingFlags.businessPrivacyEnabled, true);
  assert.equal(stagingFlags.healthEventsEnabled, false);
  assert.match(stagingHeaders, /connect-src 'self';/);
  assert.match(stagingHeaders, /https:\/\/ohrcupagdoilkwhecict.supabase.co/);
  assert.doesNotMatch(stagingHeaders, /tvixsmqxotuvyjqzmjla|ably|sentry|workos/);
  assert.match(stagingHtml(html), /Doji Admin · Staging/);
  assert.match(stagingHtml(html), /src="\/react-admin-config.js"/);
  assert.throws(() => stagingHtml(html.replace('/staging/', '/production/')));
  assert.throws(() => stagingHtml(html + 'DOJI_REACT_ADMIN_CONFIG'));
});

test('output must be new and outside the repo; existing data is never replaced', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'doji-staging-test-'));
  try {
    await assert.rejects(reserveOutput('relative-output'));
    await assert.rejects(reserveOutput(resolve('test-results/new-staging-output')));
    await writeFile(join(temporary, 'keep'), 'owner data');
    await assert.rejects(reserveOutput(temporary));
    assert.equal(await readFile(join(temporary, 'keep'), 'utf8'), 'owner data');
    assert.equal(
      await reserveOutput(join(temporary, 'new-release')),
      join(temporary, 'new-release'),
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('package contains connected admin assets and exact flags, not legacy or preview pages', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'doji-staging-test-'));
  try {
    const candidate = join(temporary, 'candidate');
    await mkdir(join(candidate, 'assets'), { recursive: true });
    await writeFile(join(candidate, 'assets/app.js'), 'synthetic connected bundle');
    await writeFile(join(candidate, 'connected.html'), html);
    await writeFile(join(candidate, 'doji-icon.png'), 'synthetic icon');
    const site = join(temporary, 'site');
    await assembleStagingSite(candidate, site, 'synthetic proxy');
    assert.equal(await readFile(join(site, 'index.html'), 'utf8'), stagingHtml(html));
    assert.equal(await readFile(join(site, '_headers'), 'utf8'), stagingHeaders);
    assert.equal(await readFile(join(site, '_worker.js'), 'utf8'), 'synthetic proxy');
    assert.equal(
      await readFile(join(site, 'react-admin-config.js'), 'utf8'),
      `window.DOJI_REACT_ADMIN_CONFIG = Object.freeze(${JSON.stringify(stagingFlags)});\n`,
    );
    await assert.rejects(assembleStagingSite(candidate, site, 'overwrite'));
    await writeFile(join(candidate, 'assets/leak.map'), '{}');
    await assert.rejects(assembleStagingSite(candidate, join(temporary, 'invalid'), 'proxy'));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
