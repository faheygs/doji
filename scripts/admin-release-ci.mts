import assert from 'node:assert/strict';
import { appendFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { affectsAdmin, trustedRun } from './admin-release-policy.mts';

const repository = 'faheygs/doji';
type Run = Record<string, unknown> & { id: number; head_sha: string; display_title: string };
async function api<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
    headers: {
      authorization: `Bearer ${process.env.GH_TOKEN}`,
      accept: 'application/vnd.github+json',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  assert.ok(response.ok, 'GitHub release metadata unavailable.');
  return (await response.json()) as T;
}
export async function planAdminRelease(
  mode: string,
  git: (args: string[]) => string = (args) => execFileSync('git', args, { encoding: 'utf8' }),
) {
  assert.equal(process.env.GITHUB_REPOSITORY, repository);
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH!, 'utf8'));
  const output = (name: string, value: string) =>
    appendFile(process.env.GITHUB_OUTPUT!, `${name}=${value}\n`);
  if (mode === 'promote') {
    const id = process.env.STAGING_RUN_ID ?? '';
    assert.match(id, /^[1-9]\d{0,19}$/);
    const run = await api<Run>(`actions/runs/${id}`);
    trustedRun(run, '.github/workflows/admin-staging.yml', ['workflow_run']);
    const sha = /^Stage admin ([a-f0-9]{40})$/.exec(run.display_title)?.[1];
    assert.ok(sha, 'Missing exact staged commit.');
    git(['merge-base', '--is-ancestor', sha, 'origin/main']);
    await output('sha', sha);
    await output('run', id);
    return;
  }
  assert.equal(mode, 'stage');
  assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_run');
  assert.ok(Number.isSafeInteger(event.workflow_run?.id));
  const run = await api<Run>(`actions/runs/${event.workflow_run.id}`);
  trustedRun(run, '.github/workflows/quality.yml', ['push']);
  assert.match(run.head_sha, /^[a-f0-9]{40}$/);
  assert.equal(event.workflow_run.head_sha, run.head_sha);
  const main = await api<{ object: { sha: string } }>('git/ref/heads/main');
  // Late quality runs must never roll staging back over a newer main commit.
  if (main.object.sha !== run.head_sha) {
    await output('changed', 'false');
    return;
  }
  const history = await api<{ workflow_runs: Run[] }>(
    'actions/workflows/admin-staging.yml/runs?branch=main&status=success&per_page=30',
  );
  let prior: Run | undefined;
  for (const item of history.workflow_runs) {
    if (!/^Stage admin [a-f0-9]{40}$/.test(item.display_title)) continue;
    trustedRun(item, '.github/workflows/admin-staging.yml', ['workflow_run']);
    const { jobs } = await api<{ jobs: { name: string; conclusion: string }[] }>(
      `actions/runs/${item.id}/jobs`,
    );
    // A disabled or path-skipped workflow is successful, but has deployed nothing.
    if (jobs.some((job) => job.name === 'deploy' && job.conclusion === 'success')) {
      prior = item;
      break;
    }
  }
  const previousSha = prior?.display_title.slice('Stage admin '.length);
  let changed = true;
  if (previousSha) {
    git(['merge-base', '--is-ancestor', previousSha, run.head_sha]);
    const paths = git(['diff', '--name-only', '-z', previousSha, run.head_sha]).split('\0');
    changed = paths.some(affectsAdmin);
  }
  await output('sha', run.head_sha);
  await output('changed', String(changed));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await planAdminRelease(process.argv[2] ?? '');
