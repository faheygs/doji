// Never accept a hosted project reference or arbitrary container target here.
import assert from 'node:assert/strict';
export const project = process.env.DOJI_LOCAL_TEST_PROJECT || 'employee-sandbox';
assert.ok(
  [
    'employee-sandbox',
    'employee-release-final',
    'employee-enrollment-check',
    'employee-cutover-verify',
  ].includes(project),
  'Local test project required',
);
export const container = `supabase_db_${project}`;
export const workdir = `D:/ChallengeApp/DoIt/test-results/${project}`;
