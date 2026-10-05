import type { Config } from 'jest';
const { jest: base }: { jest: Config } = require('./package.json');
const { areas, exclude }: typeof import('./coverage-policy.mts') = require('./coverage-policy.mts');

module.exports = {
  ...base,
  rootDir: __dirname,
  collectCoverage: true,
  collectCoverageFrom: [...Object.values(areas).flat(), ...exclude.map((pattern) => `!${pattern}`)],
  coverageDirectory: '<rootDir>/test-results/coverage/current',
  coverageReporters: ['json', 'json-summary', 'lcov', 'text-summary'],
  // Enforced by check-coverage.mts across named areas, including missing files.
  // Keep collection separate so every gap is reported after tests complete.
} satisfies Config;
