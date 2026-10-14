// Approved additive/default-disabled business database step only. No enablement,
// provider changes, secrets, email, legacy revocation or frontend deployment.
import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cli, hash, inventory } from './prepare-safety-launch.mts';
import {
  functions,
  secrets,
  pages,
  database,
  health,
  linkedWorkspace,
} from './business-disabled-release-reads.mts';
import { evidenceRecord, evidenceRows } from './release-evidence.mts';
const [folder, mode] = process.argv.slice(2);
assert.ok(folder && /^test-results\/business-owned-release-[A-Za-z0-9]+$/.test(folder));
assert.ok(mode && ['rehearse', 'apply', 'verify'].includes(mode));
const read = async (file: string) =>
  evidenceRecord(JSON.parse(await readFile(`${folder}/${file}.json`, 'utf8')));
const before = await read('baseline');
const prepared = await read('prepared');
const install = await readFile(`${folder}/install.sql`, 'utf8');
assert.equal(hash(install), prepared.installHash);
assert.deepEqual(await inventory(`${folder}/edge-before`), prepared.edgeRollback);
assert.equal(
  hash(await readFile(`${prepared.secure}/runtime-before.json`)),
  prepared.runtimeBackupHash,
);
for (const [file, expected] of Object.entries(evidenceRecord(prepared.draftHashes)))
  assert.equal(
    hash((await readFile(`supabase/overlays/${file}`, 'utf8')).replaceAll('\r\n', '\n')),
    expected,
  );
const save = (name: string, data: unknown) =>
  writeFile(`${folder}/${name}.json`, JSON.stringify(data, null, 2), { flag: 'wx' });
async function unchanged() {
  assert.deepEqual(functions(), before.functions);
  assert.deepEqual(secrets(), before.secrets);
  assert.deepEqual(await pages(), before.pages);
  const current = database(),
    old = evidenceRecord(before.database);
  assert.equal(current.event_window, false);
  assert.equal(current.overdue_sample, 0);
  for (const key of ['contracts', 'policies', 'roles']) assert.equal(current[key], old[key], key);
  return current;
}
await unchanged();
if (mode === 'rehearse') {
  await assert.rejects(
    access(`${folder}/rehearse-started.json`),
    'Inspect existing attempt before retry',
  );
  const rehearsal = await readFile(`${folder}/rehearse.sql`, 'utf8');
  assert.equal(rehearsal, install.replace(/commit;\n$/, 'rollback;\n'));
  await save('rehearse-started', {
    at: new Date().toISOString(),
    installHash: prepared.installHash,
  });
  cli([
    'db',
    'query',
    '--file',
    resolve(folder, 'rehearse.sql'),
    '--linked',
    '--workdir',
    linkedWorkspace,
    '--output-format',
    'json',
  ]);
  await unchanged();
  const result = evidenceRows(
    cli([
      'db',
      'query',
      "begin read only;set local statement_timeout='3s';select to_regclass('business_session_private.owned_auth_settings') is null as rolled_back;rollback;",
      '--linked',
      '--workdir',
      linkedWorkspace,
      '--output-format',
      'json',
    ]),
  )[0];
  assert.equal(result?.rolled_back, true);
  await save('rehearsed', {
    at: new Date().toISOString(),
    installHash: prepared.installHash,
    rolledBack: true,
  });
  console.log('Guarded database rehearsal passed and rolled back; no live auth gates changed.');
} else {
  assert.equal((await read('rehearsed')).installHash, prepared.installHash);
  if (mode === 'apply') {
    await assert.rejects(
      access(`${folder}/apply-started.json`),
      'Inspect existing attempt before retry',
    );
    await save('apply-started', {
      at: new Date().toISOString(),
      installHash: prepared.installHash,
    });
    cli([
      'db',
      'query',
      '--file',
      resolve(folder, 'install.sql'),
      '--linked',
      '--workdir',
      linkedWorkspace,
      '--output-format',
      'json',
    ]);
  }
  await unchanged();
  const result = evidenceRecord(
    evidenceRows(
      cli([
        'db',
        'query',
        `begin read only;set local statement_timeout='4s';
select jsonb_build_object('guard_enabled',(select enabled from business_session_private.owned_auth_settings where singleton),
 'acceptance_enabled',(select enabled from business_session_private.owned_auth_acceptance where singleton),
 'scope_configured',(select scope_hash is not null from business_session_private.owned_auth_settings where singleton),
 'acceptance_target_configured',(select identity_hmac is not null from business_session_private.owned_auth_acceptance where singleton),
 'legacy_installer_retained',has_function_privilege('doji_business_session','business_session_private.put_bound_session(text,text,text,integer,text,text,text,text)','execute'),
 'legacy_store_retained',has_function_privilege('doji_business_session','business_session_private.execute_store(text,text,text,text,text,integer,text,text)','execute')) state;rollback;`,
        '--linked',
        '--workdir',
        linkedWorkspace,
        '--output-format',
        'json',
      ]),
    )[0]?.state,
  );
  assert.deepEqual(result, {
    guard_enabled: false,
    acceptance_enabled: false,
    scope_configured: false,
    acceptance_target_configured: false,
    legacy_installer_retained: true,
    legacy_store_retained: true,
  });
  await save(`verified-${Date.now()}`, {
    at: new Date().toISOString(),
    installHash: prepared.installHash,
    state: result,
    health: await health(),
    memberEmployeeContractsUnchanged: true,
    deployed: 'additive-disabled-database-only',
    providerCalls: 0,
    sendingEnabled: false,
  });
  console.log(
    JSON.stringify({
      installed: true,
      gatesEnabled: false,
      legacyLoginUnchanged: true,
      memberEmployeeContractsUnchanged: true,
      providerCalls: 0,
    }),
  );
}
