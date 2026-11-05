import assert from 'node:assert/strict';
import test from 'node:test';
import { qualifyMobileSource, mobileQualityJobs } from './mobile-candidate-policy.mts';
const sha = 'a'.repeat(40);
const valid = {
  sourceSha: sha,
  mainSha: sha,
  checkoutSha: sha,
  clean: true,
  run: {
    id: 1,
    head_sha: sha,
    head_branch: 'main',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    path: '.github/workflows/quality.yml',
    head_repository: { full_name: 'faheygs/doji' },
  },
  jobs: mobileQualityJobs.map((name) => ({ name, status: 'completed', conclusion: 'success' })),
};
test('source qualification never authorizes builds or implies device acceptance', () => {
  const result = qualifyMobileSource(valid);
  assert.equal(result.sourceQualified, true);
  assert.equal(result.cloudBuildAuthorized, false);
  assert.ok(result.remainingGates.includes('physical-device-acceptance'));
});
test('rejects dirty, forked, old, mismatched, pending and incomplete candidates', () => {
  for (const input of [
    { ...valid, sourceSha: 'main' },
    { ...valid, clean: false },
    { ...valid, mainSha: 'b'.repeat(40) },
    { ...valid, checkoutSha: 'b'.repeat(40) },
    ...Object.entries({
      head_sha: 'b'.repeat(40),
      head_branch: 'branch',
      event: 'pull_request',
      status: 'in_progress',
      conclusion: 'failure',
      path: '.github/workflows/other.yml',
      id: -1,
      head_repository: { full_name: 'other/doji' },
    }).map(([name, value]) => ({ ...valid, run: { ...valid.run, [name]: value } })),
    ...mobileQualityJobs.map((name) => ({
      ...valid,
      jobs: valid.jobs.filter((job) => job.name !== name),
    })),
    { ...valid, jobs: [...valid.jobs, valid.jobs[0]!] },
    { ...valid, jobs: valid.jobs.map((job) => ({ ...job, conclusion: 'skipped' })) },
    { ...valid, jobs: valid.jobs.map((job) => ({ ...job, status: 'in_progress' })) },
  ])
    assert.throws(() => qualifyMobileSource(input));
});
