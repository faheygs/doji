import assert from 'node:assert/strict';

export type CandidateRun = {
  id: number;
  head_sha: string;
  head_branch: string;
  event: string;
  status: string;
  conclusion: string;
  path: string;
  head_repository: { full_name: string };
};
export type CandidateJob = { name: string; conclusion: string; status: string };
export const mobileQualityJobs = ['application', 'coverage', 'database', 'web-migration'] as const;

/** A reviewed source candidate is not a build authorization or hosted acceptance. */
export function qualifyMobileSource(input: {
  sourceSha: string;
  mainSha: string;
  checkoutSha: string;
  clean: boolean;
  run: CandidateRun;
  jobs: CandidateJob[];
}) {
  const { sourceSha, run, jobs } = input;
  assert.match(sourceSha, /^[a-f0-9]{40}$/, 'An exact source SHA is required');
  assert.equal(input.mainSha, sourceSha, 'Candidate must be current reviewed main');
  assert.equal(input.checkoutSha, sourceSha, 'Checkout does not match candidate');
  assert.equal(input.clean, true, 'Candidate checkout must be clean');
  assert.equal(run.head_sha, sourceSha);
  assert.equal(run.head_branch, 'main');
  assert.equal(run.head_repository.full_name, 'faheygs/doji');
  assert.equal(run.path, '.github/workflows/quality.yml');
  assert.equal(run.event, 'push');
  assert.equal(run.status, 'completed');
  assert.equal(run.conclusion, 'success');
  assert.ok(Number.isSafeInteger(run.id) && run.id > 0);
  for (const name of mobileQualityJobs) {
    const matches = jobs.filter((job) => job.name === name);
    assert.equal(matches.length, 1, `Ambiguous or missing ${name} job`);
    assert.equal(matches[0]?.status, 'completed', name);
    assert.equal(matches[0]?.conclusion, 'success', name);
  }
  return {
    sourceSha,
    qualityRunId: run.id,
    profile: 'staging',
    sourceQualified: true,
    cloudBuildAuthorized: false,
    remainingGates: [
      'backend-parity',
      'credentials-and-protected-runner',
      'fresh-included-capacity',
      'unused-build-allocation',
      'owner-build-approval',
      'physical-device-acceptance',
    ],
  } as const;
}
