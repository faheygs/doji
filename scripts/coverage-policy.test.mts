import test from 'node:test';
import assert from 'node:assert/strict';
import { assess, areaFor } from './check-coverage.mts';
import { coverageEntry } from './coverage-contracts.mts';
import coverageLibrary from 'istanbul-lib-coverage';
const { createFileCoverage } = coverageLibrary;
function entry(file: string, covered = 9, total = 10) {
  const data = createFileCoverage(file).data;
  for (let i = 0; i < total; i++) {
    const loc = { start: { line: i + 1, column: 0 }, end: { line: i + 1, column: 1 } };
    data.statementMap[i] = loc;
    data.fnMap[i] = { name: `f${i}`, decl: loc, loc, line: i + 1 };
    data.branchMap[i] = { type: 'if', loc, locations: [loc], line: i + 1 };
    data.s[i] = data.f[i] = i < covered ? 1 : 0;
    data.b[i] = [data.s[i] ?? 0];
  }
  return data;
}
test('90% exactly passes all four metrics', () => {
  assert.equal(assess(['a.ts'], { 'a.ts': entry('a.ts') }, { a: ['a.ts'] }).passed, true);
});
test('89% fails independently for all metrics', () => {
  const report = assess(['a.ts'], { 'a.ts': entry('a.ts', 89, 100) }, { a: ['a.ts'] });
  assert.equal(report.errors.length, 4);
});
test('a strong area cannot hide another failing area', () => {
  const report = assess(
    ['a.ts', 'b.ts'],
    { 'a.ts': entry('a.ts', 1000, 1000), 'b.ts': entry('b.ts', 0) },
    { a: ['a.ts'], b: ['b.ts'] },
  );
  assert.equal(report.passed, false);
  assert.equal(
    report.errors.every((message: string) => message.startsWith('b:')),
    true,
  );
});
test('missing reports and unexecuted source fail closed', () => {
  const report = assess(
    ['a.ts', 'b.ts'],
    { 'a.ts': entry('a.ts') },
    { a: ['*.ts'], empty: ['nothing.ts'] },
  );
  assert.equal(report.passed, false);
  assert.deepEqual(report.results[0]?.missing, ['b.ts']);
  assert.ok(report.errors.includes('empty: no measured source files'));
});
test('overlapping areas and malformed coverage fail', () => {
  const report = assess(['a.ts'], { 'a.ts': {} }, { a: ['*.ts'], b: ['a.ts'] });
  assert.equal(report.passed, false);
  assert.ok(report.errors.includes('Overlapping coverage areas: a.ts'));
  assert.ok(report.errors.includes('Invalid coverage entry: a.ts'));
});
for (const [file, area] of [
  ['app/(app)/(tabs)/index.tsx', 'mobile-screens'],
  ['website/admin-portal/live-client.js', 'admin-portal'],
  ['website/admin-portal/business-applications.mts', 'admin-portal'],
  ['website/portal.mts', 'shared-website'],
  ['website/employee-setup/setup.mts', 'employee-setup'],
  ['website/business-portal/access/access.js', 'business-portal'],
  ['website/business-portal/business-mfa.mts', 'business-portal'],
  ['website/identity/setup-return.mts', 'employee-setup'],
  ['website/safety-removal/form.js', 'safety-intake'],
  ['website/safety-removal/form.mts', 'safety-intake'],
  ['infra/portal-identity-candidate/employee-http.mts', 'portal-identity'],
  ['infra/portal-identity-candidate/business-browser-client.mts', 'portal-identity'],
  ['infra/doji-orchestrator/src/index.ts', 'orchestrator'],
  ['supabase/functions/fanout-doji-push/index.ts', 'edge-functions'],
] as const)
  test(`inventories ${file} in exactly one area`, () => assert.deepEqual(areaFor(file), [area]));
for (const file of [
  'app/types.d.ts',
  'infra/portal-identity-candidate/contracts.d.mts',
  'website/admin-portal/live-client.test.mts',
  'website/.admin-dist/portal.js',
  'website/admin-portal/e2e/test.spec.mjs',
  'website/business-portal/playwright.application.config.mts',
  'website/business-portal/playwright.config.mts',
])
  test(`excludes non-source ${file}`, () => {
    assert.deepEqual(areaFor(file), []);
  });

test('implicit else source locations survive validation without invented positions', () => {
  const raw = entry('a.ts');
  const serialized = JSON.parse(JSON.stringify(raw));
  serialized.branchMap[0].locations.push({ start: {}, end: {} });
  serialized.b[0].push(0);
  assert.deepEqual(coverageEntry(serialized), serialized);
});
for (const count of [-1, Infinity, NaN, '9', null]) {
  test(`invalid counter ${String(count)} cannot satisfy coverage`, () => {
    const raw = { ...entry('a.ts'), s: { 0: count } };
    assert.equal(assess(['a.ts'], { 'a.ts': raw }, { a: ['a.ts'] }).passed, false);
  });
}
