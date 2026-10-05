// Read-only transport timing. Uses an impossible scope, never an employee handle.
import { readFile } from 'node:fs/promises';
import type * as Pg from 'pg';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { createRestrictedSql } from '../infra/portal-identity-candidate/restricted-sql.mts';
import type { RestrictedSqlConfig } from '../infra/portal-identity-candidate/restricted-sql.mts';
import { evidenceRecord } from './release-evidence.mts';
const require = createRequire(import.meta.url);
// Keep the original runtime package boundary; the root has types, not pg itself.
const pg: typeof Pg = require('../infra/portal-identity-candidate/node_modules/pg/lib/index.js');
const value = evidenceRecord(
  JSON.parse(await readFile('.artifacts/employee-runtime/database.json', 'utf8')),
);
assert.ok(
  value.realm === 'employee' &&
    typeof value.host === 'string' &&
    typeof value.projectRef === 'string' &&
    typeof value.port === 'number' &&
    typeof value.database === 'string' &&
    typeof value.username === 'string' &&
    typeof value.password === 'string' &&
    (value.ca === undefined || typeof value.ca === 'string'),
  'Invalid employee database configuration',
);
const config: RestrictedSqlConfig = {
  realm: value.realm,
  host: value.host,
  projectRef: value.projectRef,
  port: value.port,
  database: value.database,
  username: value.username,
  password: value.password,
  ...(value.ca === undefined ? {} : { ca: value.ca }),
};
for (let trial = 1; trial <= 3; trial++) {
  const stages: { stage: string; ms: number }[] = [];
  const execute = createRestrictedSql(config, (options) => {
    const client = new pg.Client(options);
    async function timed<T>(method: string, operation: () => Promise<T>): Promise<T> {
      const start = performance.now();
      try {
        return await operation();
      } finally {
        stages.push({ stage: method, ms: Math.round(performance.now() - start) });
      }
    }
    return {
      connect: () => timed('connect', () => client.connect()),
      query: (input) => timed('query', () => client.query(input)),
      end: () => timed('end', () => client.end()),
    };
  });
  const start = performance.now();
  let outcome = 'unexpected-success';
  try {
    await execute(
      'doji_employee_session',
      'select employee_session_private.execute_store($1,$2,$3,$4,$5,$6::integer,$7,$8) as result',
      ['0'.repeat(64), 'peek', 'flow', '0'.repeat(64), null, null, null, null],
      AbortSignal.timeout(5000),
    );
  } catch (error) {
    outcome =
      error && typeof error === 'object' && 'code' in error && error.code === '42501'
        ? 'expected-scope-denial'
        : 'transport-unavailable';
  }
  console.log(
    JSON.stringify({ trial, outcome, totalMs: Math.round(performance.now() - start), stages }),
  );
}
