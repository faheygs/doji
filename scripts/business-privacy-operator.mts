// Manual case handoff only. No scheduler, deployment import or bulk account mode.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { cli, ref } from './prepare-safety-launch.mts';
import { evidenceRecord, evidenceRows } from './release-evidence.mts';
import { linkedWorkspace } from './business-disabled-release-reads.mts';
import { createBusinessPrivacyOperator } from '../infra/portal-identity-candidate/business-privacy-operator.mts';
const [mode, caseId, argument] = process.argv.slice(2);
assert.ok(
  mode === 'export' || mode === 'erase',
  'Use export CASE REVISION or erase CASE EXECUTION --execute-reviewed-erasure',
);
assert.ok(caseId && argument, 'Exact reviewed case and revision/execution required');
if (mode === 'erase')
  assert.ok(
    process.argv.includes('--execute-reviewed-erasure'),
    'Explicit irreversible-operation flag required',
  );
assert.equal((await readFile(`${linkedWorkspace}/supabase/.temp/project-ref`, 'utf8')).trim(), ref);
const credentials = evidenceRecord(
  JSON.parse(
    await readFile(`${linkedWorkspace}/.artifacts/workos-production/credentials.json`, 'utf8'),
  ),
);
const business = evidenceRecord(credentials.business);
assert.equal(business.environment, 'environment_01M3T5131BPKBR7F6P2MAG6SBJ');
assert.equal(business.clientId, 'client_01M3T51363MDZZK6X8DB7NS32N');
assert.equal(typeof business.apiKey, 'string');
const config = {
  enabled: true,
  realm: 'business' as const,
  clientId: String(business.clientId),
  apiKey: String(business.apiKey),
};
const functions = {
  export: 'export_business_identity_target',
  claim: 'claim_business_identity_erasure',
  finish: 'finish_business_identity_erasure',
} as const;
const operator = createBusinessPrivacyOperator(config, async (operation, values) => {
  const args = values
    .map((v) => (typeof v === 'number' ? String(v) : "'" + v.replaceAll("'", "''") + "'"))
    .join(',');
  const result = evidenceRows(
    cli([
      'db',
      'query',
      `begin;set local lock_timeout='2s';set local statement_timeout='5s';select portal_identity_private.${functions[operation]}(${args}) as result;commit;`,
      '--linked',
      '--workdir',
      linkedWorkspace,
      '--output-format',
      'json',
    ]),
  );
  assert.equal(result.length, 1);
  return result[0]?.result;
});
// Confidential identity exports never enter console, test-results or Git.
const destination = '.artifacts/business-privacy';
await mkdir(destination, { recursive: true });
execFileSync('git', ['check-ignore', destination + '/probe.json'], { stdio: 'pipe' });
const owner = execFileSync('whoami', [], { encoding: 'utf8' }).trim();
execFileSync(
  'icacls',
  [destination, '/inheritance:r', '/grant:r', `${owner}:(OI)(CI)F`, 'SYSTEM:(OI)(CI)F'],
  { stdio: 'pipe' },
);
try {
  const result =
    mode === 'export'
      ? await operator.exportIdentity(caseId, Number(argument))
      : await operator.erase(caseId, argument);
  const output = `${destination}/${mode}-${Date.now()}.json`;
  await writeFile(
    output,
    JSON.stringify({ at: new Date().toISOString(), caseId, result }, null, 2),
    { flag: 'wx' },
  );
  console.log(
    `${mode === 'export' ? 'Identity-only export' : 'Erasure execution result'} saved in protected ${output}. Staff must review remaining retention/provider evidence before closing the privacy case.`,
  );
} catch {
  throw Error(
    'Business privacy operation stopped. Reconcile the exact reviewed case; never retry an uncertain deletion with a new execution ID. Sensitive output suppressed.',
  );
}
