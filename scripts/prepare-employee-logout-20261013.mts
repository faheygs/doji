// Local-only backport onto the captured v23 runtime. No network or deployment.
import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { hash, inventory } from './prepare-safety-launch.mts';
const root = 'test-results/employee-logout-release-20261013';
const relative = 'supabase/functions/employee-portal-v2/runtime/employee-http.mjs';
const bytes = await readFile(root + '/baseline/' + relative);
assert.equal(hash(bytes), 'e4788ced248818af8839f9373ad60777d02e72a9aeb2c7e639762de745105bf3');
let source = bytes.toString('utf8');
const newline = source.includes('\r\n') ? '\r\n' : '\n';
function replace(before: string, after: string) {
  before = before.replaceAll('\n', newline);
  after = after.replaceAll('\n', newline);
  assert.equal(source.split(before).length, 2, 'Unexpected deployed source shape');
  source = source.replace(before, after);
}
replace('\nexport function createEmployeeHttp(', `
// Confirmation covers this portal session, not an unverified provider revocation.
function alreadySignedOut() {
  return json({ signedIn: false }, 200, [cookieHeader(sessionCookie, '', 0)]);
}

export function createEmployeeHttp(`);
replace('      if (!handle) throw fail();', `      if (!handle) {
        const supplied = (request.headers.get('cookie') || '').split(';')
          .some(value => value.trim().startsWith(sessionCookie + '='));
        if (path === '/auth/logout' && !supplied) {
          await body(request, []);
          return alreadySignedOut();
        }
        throw fail();
      }`);
replace('          if (!cell.value) throw fail();', `          if (!cell.value) {
            if (path === '/auth/logout') return alreadySignedOut();
            throw fail();
          }`);
replace(`            saved = open(cell.value, 'session');
          } catch {
            await cell.remove();
            throw fail();`, `            saved = open(cell.value, 'session');
          } catch {
            await cell.remove();
            if (path === '/auth/logout') return alreadySignedOut();
            throw fail();`);
replace(`          if (saved.created + 8 * 3600000 <= now() || saved.touched + 30 * 60000 <= now()) {
            await cell.remove();
            await revoke(saved.actor.sessionId);
            throw fail();`, `          if (saved.created + 8 * 3600000 <= now() || saved.touched + 30 * 60000 <= now()) {
            await cell.remove();
            await revoke(saved.actor.sessionId);
            if (path === '/auth/logout') return alreadySignedOut();
            throw fail();`);
const before = await inventory(root + '/baseline/supabase/functions');
for (const name of ['candidate', 'rollback']) {
  await cp(root + '/baseline', root + '/' + name, { recursive: true, force: false, errorOnExist: true });
  await writeFile(root + '/' + name + '/supabase/config.toml',
    'project_id = "employee-logout-only"\n[functions.employee-portal-v2]\nverify_jwt = false\nimport_map = "./functions/employee-portal-v2/deno.json"\n');
}
await writeFile(root + '/candidate/' + relative, source);
const after = await inventory(root + '/candidate/supabase/functions');
assert.deepEqual(before.map(x => x.path), after.map(x => x.path));
assert.deepEqual(after.filter((x, i) => x.sha256 !== before[i]?.sha256).map(x => x.path),
  ['employee-portal-v2/runtime/employee-http.mjs']);
assert.deepEqual(await inventory(root + '/rollback/supabase/functions'), before);
const tests = ['test-employee-http', 'test-employee-browser-transport', 'test-employee-runtime-boundaries'];
const directory = root + '/runtime-tests';
await mkdir(directory);
for (const name of tests) {
  let testSource = ts.transpileModule(await readFile('scripts/' + name + '.mts', 'utf8'), {
    fileName: name + '.mts', compilerOptions: {
      module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, rewriteRelativeImportExtensions: true,
    },
  }).outputText;
  testSource = testSource.replace(/(['"])\.\.\/infra\/portal-identity\/([^'"]+)\1/g,
    (_, quote: string, file: string) => {
      const suffix = file.replace(/\.mts$/, '.mjs');
      return before.some(x => x.path === 'employee-portal-v2/runtime/' + suffix)
        ? quote + '../candidate/supabase/functions/employee-portal-v2/runtime/' + suffix + quote
        : quote + '../../../infra/portal-identity/' + file.replace(/\.mjs$/, '.mts') + quote;
    }).replace(/(['"])\.\/([^'"]+)\1/g,
      (_, quote: string, file: string) => quote + '../../../scripts/' + file.replace(/\.mjs$/, '.mts') + quote);
  await writeFile(directory + '/' + name + '.mjs', testSource, { flag: 'wx' });
}
const result = execFileSync(process.execPath, ['--test', ...tests.map(name => directory + '/' + name + '.mjs')], {
  encoding: 'utf8', timeout: 60000, maxBuffer: 2e6,
});
await writeFile(root + '/runtime-tests.tap', result, { flag: 'wx' });
await writeFile(root + '/prepared.json', JSON.stringify({
  at: new Date().toISOString(), before, after, tests, testOutputSha256: hash(result),
  candidateConfig: hash(await readFile(root + '/candidate/supabase/config.toml')),
  productionChanged: false,
}, null, 2), { flag: 'wx' });
console.log(result);
console.log('Only employee-http.mjs changed; rollback is byte-identical to the captured runtime.');
