// Read-only source preflight. No EAS CLI, secrets, build dispatch or submissions.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import {
  qualifyMobileSource,
  type CandidateRun,
  type CandidateJob,
} from './mobile-candidate-policy.mts';

export async function inspectMobileCandidate(sourceSha: string, runId: string) {
  assert.match(sourceSha, /^[a-f0-9]{40}$/);
  assert.match(runId, /^[1-9]\d{0,19}$/);
  assert.ok(process.env.GH_TOKEN, 'Read-only GitHub token is required');
  const api = async <T,>(path: string): Promise<T> => {
    const response = await fetch(`https://api.github.com/repos/faheygs/doji/${path}`, {
      headers: {
        authorization: `Bearer ${process.env.GH_TOKEN}`,
        accept: 'application/vnd.github+json',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    assert.ok(response.ok, 'Candidate GitHub metadata unavailable');
    return (await response.json()) as T;
  };
  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const [main, run, jobs] = await Promise.all([
    api<{ object: { sha: string } }>('git/ref/heads/main'),
    api<CandidateRun>(`actions/runs/${runId}`),
    api<{ jobs: CandidateJob[]; total_count: number }>(`actions/runs/${runId}/jobs?per_page=100`),
  ]);
  assert.ok(jobs.total_count <= 100, 'Job list exceeds verification bound');
  const result = qualifyMobileSource({
    sourceSha,
    mainSha: main.object.sha,
    checkoutSha: git('rev-parse', 'HEAD'),
    clean: git('status', '--porcelain') === '',
    run,
    jobs: jobs.jobs,
  });
  assert.equal(
    (await api<{ object: { sha: string } }>('git/ref/heads/main')).object.sha,
    sourceSha,
    'Main changed during qualification',
  );
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  console.log(
    JSON.stringify(
      await inspectMobileCandidate(process.argv[2] || '', process.argv[3] || ''),
      null,
      2,
    ),
  );
