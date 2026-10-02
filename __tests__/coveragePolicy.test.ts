const { assess, areaFor } = require('../scripts/check-coverage.cjs');
const { createFileCoverage } = require('istanbul-lib-coverage');
function entry(file: string, covered = 9, total = 10) {
  const data = createFileCoverage(file).toJSON();
  for (let i = 0; i < total; i++) {
    const loc = { start: { line: i + 1, column: 0 }, end: { line: i + 1, column: 1 } };
    data.statementMap[i] = loc;
    data.fnMap[i] = { name: `f${i}`, decl: loc, loc, line: i + 1 };
    data.branchMap[i] = { type: 'if', loc, locations: [loc], line: i + 1 };
    data.s[i] = data.f[i] = i < covered ? 1 : 0;
    data.b[i] = [data.s[i]];
  }
  return data;
}
test('90% exactly passes all four metrics', () => {
  expect(assess(['a.ts'], { 'a.ts': entry('a.ts') }, { a: ['a.ts'] }).passed).toBe(true);
});
test('89% fails independently for all metrics', () => {
  const report = assess(['a.ts'], { 'a.ts': entry('a.ts', 89, 100) }, { a: ['a.ts'] });
  expect(report.errors).toHaveLength(4);
});
test('a strong area cannot hide another failing area', () => {
  const report = assess(
    ['a.ts', 'b.ts'],
    { 'a.ts': entry('a.ts', 1000, 1000), 'b.ts': entry('b.ts', 0) },
    { a: ['a.ts'], b: ['b.ts'] },
  );
  expect(report.passed).toBe(false);
  expect(report.errors.every((message: string) => message.startsWith('b:'))).toBe(true);
});
test('missing reports and unexecuted source fail closed', () => {
  const report = assess(
    ['a.ts', 'b.ts'],
    { 'a.ts': entry('a.ts') },
    { a: ['*.ts'], empty: ['nothing.ts'] },
  );
  expect(report.passed).toBe(false);
  expect(report.results[0].missing).toEqual(['b.ts']);
  expect(report.errors).toContain('empty: no measured source files');
});
test('overlapping areas and malformed coverage fail', () => {
  const report = assess(['a.ts'], { 'a.ts': {} }, { a: ['*.ts'], b: ['a.ts'] });
  expect(report.passed).toBe(false);
  expect(report.errors).toContain('Overlapping coverage areas: a.ts');
  expect(report.errors).toContain('Invalid coverage entry: a.ts');
});
test.each([
  ['app/(app)/(tabs)/index.tsx', 'mobile-screens'],
  ['website/admin-portal/live-client.js', 'admin-portal'],
  ['website/business-portal/access/access.js', 'business-portal'],
  ['website/safety-removal/form.js', 'safety-intake'],
  ['infra/portal-identity-candidate/employee-http.mjs', 'portal-identity'],
  ['infra/doji-orchestrator/src/index.ts', 'orchestrator'],
  ['supabase/functions/fanout-doji-push/index.ts', 'edge-functions'],
])('inventories %s in exactly one area', (file, area) => expect(areaFor(file)).toEqual([area]));
test.each([
  'app/types.d.ts',
  'website/admin-portal/live-client.test.mjs',
  'website/.admin-dist/portal.js',
  'website/admin-portal/e2e/test.spec.mjs',
])('excludes non-source %s', (file) => {
  expect(areaFor(file)).toEqual([]);
});
