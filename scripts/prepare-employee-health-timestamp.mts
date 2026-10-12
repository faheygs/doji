// LOCAL preparation only. No network, deployment, secrets or provider calls.
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { patchEmployeeHealthTimestamp } from './employee-health-timestamp-patch.mts';
assert.equal(process.argv.length, 2, 'No deployment options accepted');
const base = 'test-results/react-admin-announcements-20261009/edge-on-download';
const root = 'test-results/employee-health-timestamp-20261009';
const relative = 'supabase/functions/employee-portal-v2/runtime/employee-health.mjs';
async function inventory(dir: string, prefix = ''): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory())
      Object.assign(result, await inventory(dir + '/' + entry.name, path + '/'));
    else
      result[path] = createHash('sha256')
        .update(await readFile(dir + '/' + entry.name))
        .digest('hex');
  }
  return result;
}
const before = await inventory(base);
const patched = patchEmployeeHealthTimestamp(await readFile(base + '/' + relative));
await mkdir(root, { recursive: true });
for (const name of ['candidate', 'rollback']) {
  await cp(base, root + '/' + name, { recursive: true, force: false, errorOnExist: true });
}
await writeFile(root + '/candidate/' + relative, patched);
const after = await inventory(root + '/candidate');
assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
assert.deepEqual(
  Object.keys(before).filter((key) => before[key] !== after[key]),
  [relative],
);
assert.deepEqual(await inventory(root + '/rollback'), before);
await writeFile(
  root + '/prepared.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      changed: [relative],
      before,
      after,
      productionChanged: false,
      deploymentApproved: false,
      rollback: 'Exact captured baseline; recapture/compare deployed package before release.',
    },
    null,
    2,
  ),
  { flag: 'wx' },
);
console.log('Prepared one-file employee health patch and byte-identical rollback. Not deployed.');
