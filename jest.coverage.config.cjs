const base = require('./package.json').jest;
const { areas, exclude } = require('./coverage-policy.cjs');

module.exports = {
  ...base,
  rootDir: __dirname,
  collectCoverage: true,
  collectCoverageFrom: [...Object.values(areas).flat(), ...exclude.map((pattern) => `!${pattern}`)],
  coverageDirectory: '<rootDir>/test-results/coverage/current',
  coverageReporters: ['json', 'json-summary', 'lcov', 'text-summary'],
  // Enforced by check-coverage.cjs across named areas, including missing files.
  // Keep collection separate so every gap is reported after tests complete.
};
