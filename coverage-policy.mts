// Independent area budgets: a well-tested utility cannot hide an untested UI.
// Include executable source, including files that no test imports. No generated
// artifacts, dependencies, declarations or test code belong in the denominator.
export const minimum = Object.freeze({ statements: 90, branches: 90, functions: 90, lines: 90 });
export const metrics = ['statements', 'branches', 'functions', 'lines'] as const;
export type CoveragePolicy = Readonly<Record<string, readonly string[]>>;
export const areas: CoveragePolicy = Object.freeze({
  'mobile-screens': ['app/**/*.{ts,tsx}', 'index.ts'],
  'mobile-components': ['components/**/*.{ts,tsx}'],
  'mobile-hooks': ['hooks/**/*.{ts,tsx}'],
  'mobile-library': ['lib/**/*.{ts,tsx}'],
  'mobile-contexts': ['contexts/**/*.{ts,tsx}'],
  'mobile-stores': ['stores/**/*.{ts,tsx}'],
  'mobile-utilities': ['utils/**/*.{ts,tsx}'],
  'mobile-constants': ['constants/**/*.{ts,tsx}'],
  'member-command-contracts': ['contracts/**/*.{ts,tsx}'],
  'admin-portal': ['website/admin-portal/*.{js,mts}'],
  'business-portal': ['website/business-portal/**/*.{js,mts}'],
  'safety-intake': ['website/safety-removal/**/*.{js,mts}'],
  'employee-setup': ['website/employee-setup/**/*.{js,mts}', 'website/identity/**/*.{js,mts}'],
  'shared-website': [
    'website/portal.mts',
    'website/portal-select.mts',
    'website/portal-config.mts',
    'website/theme-init.mts',
  ],
  'portal-identity': ['infra/portal-identity-candidate/*.{mjs,mts}'],
  orchestrator: ['infra/doji-orchestrator/src/**/*.ts'],
  'edge-functions': ['supabase/functions/**/*.ts'],
});
export const exclude = [
  '**/*.d.ts',
  '**/*.d.mts',
  '**/*.d.cts',
  '**/*.test.*',
  '**/*.spec.*',
  '**/__tests__/**',
  '**/__mocks__/**',
  '**/e2e/**',
  '**/playwright*.config.*',
];
