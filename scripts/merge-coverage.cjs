const { readFileSync, writeFileSync, readdirSync, existsSync } = require('node:fs');
const path = require('node:path');
const { createCoverageMap } = require('istanbul-lib-coverage');
const { eligible, instrument } = require('./coverage-instrument.cjs');
const { inventory } = require('./check-coverage.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results/coverage/current');
const report = path.join(output, 'coverage-final.json');
const jest = JSON.parse(readFileSync(report, 'utf8'));
const map = createCoverageMap({});
for (const [file, coverage] of Object.entries(jest)) {
  if (!eligible(file)) map.addFileCoverage(coverage);
  else if (Object.values(coverage.s).some((count) => count > 0)) {
    // Never merge incompatible Babel/Istanbul statement maps or silently drop
    // measured JS. These sources use one shared instrumenter in Node/browser.
    throw Error(`Move JS coverage into the shared instrumenter before merging: ${file}`);
  }
}
for (const relative of inventory()) {
  const file = path.join(root, relative);
  if (eligible(file)) map.addFileCoverage(instrument(readFileSync(file, 'utf8'), file).coverage);
}
for (const directory of ['node', 'browser']) {
  const folder = path.join(output, directory);
  if (!existsSync(folder)) continue;
  for (const file of readdirSync(folder).filter((name) => name.endsWith('.json'))) {
    map.merge(JSON.parse(readFileSync(path.join(folder, file), 'utf8')));
  }
}
writeFileSync(report, JSON.stringify(map.toJSON()));
const summary = { total: map.getCoverageSummary().toJSON() };
for (const file of map.files()) summary[file] = map.fileCoverageFor(file).toSummary().toJSON();
writeFileSync(path.join(output, 'coverage-summary.json'), JSON.stringify(summary, null, 2));
const context = require('istanbul-lib-report').createContext({ dir: output, coverageMap: map });
for (const format of ['lcov', 'html']) require('istanbul-reports').create(format).execute(context);
