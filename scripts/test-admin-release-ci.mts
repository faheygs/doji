import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { planAdminRelease } from './admin-release-ci.mts';

test('CI selects only admin changes since a real deployment, and refuses stale or untrusted runs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'doji-release-ci-'));
  const originalFetch = globalThis.fetch;
  const environment = { ...process.env };
  const sha = 'a'.repeat(40);
  const priorSha = 'b'.repeat(40);
  const trusted = {
    head_branch: 'main',
    status: 'completed',
    conclusion: 'success',
    repository: { full_name: 'faheygs/doji' },
    head_repository: { full_name: 'faheygs/doji' },
  };
  let quality = {
    ...trusted,
    id: 7,
    head_sha: sha,
    event: 'push',
    path: '.github/workflows/quality.yml',
  };
  let main = sha;
  const previous = {
    ...trusted,
    id: 5,
    head_sha: priorSha,
    event: 'workflow_run',
    path: '.github/workflows/admin-staging.yml',
    display_title: `Stage admin ${priorSha}`,
  };
  let history = [{ ...previous, id: 6, display_title: `Stage admin ${sha}` }, previous];
  let olderHistory: typeof history | undefined;
  let paths = 'web/apps/admin/src/App.tsx\0';
  let diffBase = '';
  const git = (args: string[]) => {
    if (args[0] === 'diff') {
      diffBase = args[3]!;
      return paths;
    }
    assert.deepEqual(args.slice(0, 2), ['merge-base', '--is-ancestor']);
    return '';
  };
  try {
    Object.assign(process.env, {
      GITHUB_REPOSITORY: 'faheygs/doji',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_EVENT_NAME: 'workflow_run',
      GITHUB_EVENT_PATH: join(root, 'event.json'),
      GITHUB_OUTPUT: join(root, 'output'),
      STAGING_RUN_ID: '5',
      GH_TOKEN: 'synthetic',
    });
    await writeFile(
      process.env.GITHUB_EVENT_PATH!,
      JSON.stringify({ workflow_run: { id: 7, head_sha: sha } }),
    );
    globalThis.fetch = async (input) => {
      const url = String(input);
      assert.ok(url.startsWith('https://api.github.com/repos/faheygs/doji/'));
      let body: unknown;
      if (url.endsWith('/actions/runs/7')) body = quality;
      else if (url.endsWith('/actions/runs/5')) body = previous;
      else if (url.endsWith('/actions/runs/6')) body = { ...previous, id: 6 };
      else if (url.endsWith('/git/ref/heads/main')) body = { object: { sha: main } };
      else if (url.includes('/actions/workflows/admin-staging.yml/runs?'))
        body = { workflow_runs: url.endsWith('page=1') ? history : (olderHistory ?? history) };
      else if (url.endsWith('/actions/runs/6/jobs'))
        body = { jobs: [{ name: 'deploy', conclusion: 'skipped' }] };
      else if (url.endsWith('/actions/runs/5/jobs'))
        body = { jobs: [{ name: 'deploy', conclusion: 'success' }] };
      else throw Error('Unexpected request: ' + url);
      return Response.json(body);
    };
    const plan = async (mode = 'stage') => {
      await writeFile(process.env.GITHUB_OUTPUT!, '');
      await planAdminRelease(mode, git);
      return readFile(process.env.GITHUB_OUTPUT!, 'utf8');
    };
    assert.match(await plan(), /changed=true/);
    assert.equal(diffBase, priorSha, 'Skipped run must not hide undeployed changes');
    for (paths of [
      'web/apps/business/src/App.tsx\0',
      'app/index.tsx\0',
      'supabase/migrations/one.sql\0',
    ])
      assert.match(await plan(), /changed=false/);
    paths = 'web/packages/ui/src/theme.ts\0';
    assert.match(await plan(), /changed=true/);
    history = Array.from({ length: 100 }, () => ({ ...previous, id: 6 }));
    olderHistory = [previous];
    paths = 'web/apps/business/src/App.tsx\0';
    assert.match(
      await plan(),
      /changed=false/,
      'Many skipped runs must not trigger an admin deployment',
    );
    assert.equal(diffBase, priorSha);
    olderHistory = undefined;
    await assert.rejects(plan(), /history exceeds the lookup bound/);
    history = [];
    assert.match(
      await plan(),
      /changed=true/,
      'First enabled run must package even with no prior deployment',
    );
    main = priorSha;
    assert.equal(await plan(), 'changed=false\n');
    main = sha;
    quality = { ...quality, conclusion: 'failure' };
    await assert.rejects(plan());
    quality = { ...quality, conclusion: 'success', event: 'pull_request' };
    await assert.rejects(plan());
    assert.equal(await plan('promote'), `sha=${priorSha}\nrun=5\n`);
    process.env.STAGING_RUN_ID = '6';
    await assert.rejects(plan('promote'), /did not deploy/);
    process.env.STAGING_RUN_ID = '5; echo unsafe';
    await assert.rejects(plan('promote'));
    process.env.GITHUB_REF = 'refs/heads/feature';
    await assert.rejects(plan());
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
    Object.assign(process.env, environment);
    await rm(root, { recursive: true, force: true });
  }
});
