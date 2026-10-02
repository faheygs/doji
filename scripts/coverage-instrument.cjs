const { createInstrumenter } = require('istanbul-lib-instrument');
const { areaFor } = require('./check-coverage.cjs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function eligible(file) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  return /\.(?:mjs|js)$/.test(relative) && areaFor(relative).length === 1;
}
function instrument(source, file) {
  const tool = createInstrumenter({
    esModules: true,
    compact: false,
    coverageVariable: '__coverage__',
    produceSourceMap: true,
    coverageGlobalScope: 'globalThis',
    coverageGlobalScopeFunc: false,
  });
  const code = tool.instrumentSync(source, file);
  return { code, coverage: tool.lastFileCoverage() };
}
module.exports = { eligible, instrument };
