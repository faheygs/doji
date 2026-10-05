import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import coverageLibrary from 'istanbul-lib-coverage';
const { createCoverageMap } = coverageLibrary;
import { minimatch } from 'minimatch';
import { areas, exclude, minimum, metrics } from '../coverage-policy.mts';
import type { CoveragePolicy } from '../coverage-policy.mts';
import { coverageEntry } from './coverage-contracts.mts';

const root = path.resolve(import.meta.dirname, '..');
const slash = (value: string) => value.replaceAll('\\', '/');
export function inventory(directory = root, prefix = ''): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const name = prefix + entry.name;
    if (entry.isDirectory()) {
      if (
        entry.name.startsWith('.') ||
        [
          'node_modules',
          'test-results',
          'coverage',
          'browser-test-output',
          'android',
          'ios',
        ].includes(entry.name)
      )
        continue;
      files.push(...inventory(path.join(directory, entry.name), name + '/'));
    } else files.push(name);
  }
  return files;
}
export function areaFor(file: string, policy: CoveragePolicy = areas) {
  if (exclude.some((pattern) => minimatch(file, pattern))) return [];
  return Object.entries(policy)
    .filter(([, patterns]) => patterns.some((pattern) => minimatch(file, pattern)))
    .map(([name]) => name);
}
export function assess(
  files: readonly string[],
  data: Readonly<Record<string, unknown>>,
  policy: CoveragePolicy = areas,
) {
  const errors: string[] = [];
  const reports = Object.fromEntries(
    Object.keys(policy).map((name) => [name, createCoverageMap({})]),
  );
  const missing = Object.fromEntries(Object.keys(policy).map((name) => [name, [] as string[]]));
  const normalized = Object.fromEntries(
    Object.entries(data).map(([file, coverage]) => [
      slash(path.isAbsolute(file) ? path.relative(root, file) : file),
      coverage,
    ]),
  );
  for (const file of files) {
    const assigned = areaFor(file, policy);
    if (assigned.length > 1) errors.push(`Overlapping coverage areas: ${file}`);
    for (const area of assigned) {
      const entry = normalized[file];
      if (!entry) missing[area]?.push(file);
      else {
        try {
          reports[area]?.addFileCoverage(coverageEntry(entry));
        } catch {
          errors.push(`Invalid coverage entry: ${file}`);
        }
      }
    }
  }
  const results = Object.entries(reports).map(([area, map]) => {
    const summary = map.getCoverageSummary().toJSON();
    const absent = missing[area] ?? [];
    if (absent.length)
      errors.push(`${area}: ${absent.length} source files have no coverage report`);
    if (!map.files().length) errors.push(`${area}: no measured source files`);
    for (const metric of metrics) {
      const threshold = minimum[metric];
      const { total, covered } = summary[metric];
      // Compare exact counts, never rounded percentages (89.999% is not 90%).
      if (total > 0 && covered * 100 < total * threshold) {
        errors.push(`${area}: ${metric} ${summary[metric].pct}% < ${threshold}%`);
      }
    }
    return { area, files: map.files().length, missing: absent, ...summary };
  });
  return { minimum, results, errors, passed: errors.length === 0 };
}
function main() {
  const report = path.join(root, 'test-results/coverage/current/coverage-final.json');
  if (!fs.existsSync(report))
    throw Error('Missing current coverage report. Run npm run test:coverage.');
  const result = assess(inventory(), JSON.parse(fs.readFileSync(report, 'utf8')));
  fs.writeFileSync(
    path.join(path.dirname(report), 'areas.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  console.table(
    result.results.map((item) => ({
      area: item.area,
      files: item.files,
      missing: item.missing.length,
      lines: item.lines.pct,
      statements: item.statements.pct,
      functions: item.functions.pct,
      branches: item.branches.pct,
    })),
  );
  for (const error of result.errors) console.error(error);
  if (!result.passed) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Coverage assessment failed');
    process.exitCode = 1;
  }
}
