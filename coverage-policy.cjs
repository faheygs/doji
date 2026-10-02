// Independent area budgets: a well-tested utility cannot hide an untested UI.
// Include executable source, including files that no test imports. No generated
// artifacts, dependencies, declarations or test code belong in the denominator.
const minimum = Object.freeze({ statements: 90, branches: 90, functions: 90, lines: 90 });
const areas = Object.freeze({
  'mobile-screens': ['app/**/*.{ts,tsx}', 'index.ts'],
  'mobile-components': ['components/**/*.{ts,tsx}'],
  'mobile-hooks': ['hooks/**/*.{ts,tsx}'],
  'mobile-library': ['lib/**/*.{ts,tsx}'],
  'mobile-contexts': ['contexts/**/*.{ts,tsx}'],
  'mobile-stores': ['stores/**/*.{ts,tsx}'],
  'mobile-utilities': ['utils/**/*.{ts,tsx}'],
  'mobile-constants': ['constants/**/*.{ts,tsx}'],
  'member-command-contracts': ['contracts/**/*.{ts,tsx}'],
  'admin-portal': ['website/admin-portal/*.js'],
  'business-portal': ['website/business-portal/**/*.js'],
  'safety-intake': ['website/safety-removal/**/*.js'],
  'employee-setup': ['website/employee-setup/**/*.js', 'website/identity/**/*.js'],
  'shared-website': [
    'website/portal.js',
    'website/portal-select.js',
    'website/portal-config.js',
    'website/theme-init.js',
  ],
  'portal-identity': ['infra/portal-identity-candidate/*.mjs'],
  orchestrator: ['infra/doji-orchestrator/src/**/*.ts'],
  'edge-functions': ['supabase/functions/**/*.ts'],
});
const exclude = [
  '**/*.d.ts',
  '**/*.test.*',
  '**/*.spec.*',
  '**/__tests__/**',
  '**/__mocks__/**',
  '**/e2e/**',
];
module.exports = { minimum, areas, exclude };
