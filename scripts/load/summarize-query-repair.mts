import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { jsonRecord, metricSamples } from './contracts.mts';
const root = 'test-results/local-query-repair-20260928';
const json = (name: string) => jsonRecord(readFileSync(`${root}/${name}.json`, 'utf8'));
const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
const gates = ['ramp', 'soak', 'app-shape', 'recovery'].map((name) => {
  const data = json(`${name}-gate`);
  return { name, ...data, passed: data.passed };
});
for (const gate of gates) assert.equal(gate.passed, true, `${gate.name} failed`);
const heavy = json('validated-launch-heavy-20m');
assert.equal(heavy.seconds, 1200);
assert.ok(typeof heavy.wallMs === 'number' && heavy.wallMs >= 1200000);
const replay = json('concurrency');
assert.equal(replay.mentionAlertIntents, 1);
const rollback = json('rollback-verification');
assert.equal(rollback.exactRollback, true);
assert.equal(rollback.exactReapply, true);
assert.match(readFileSync(`${root}/parity.txt`, 'utf8'), /PASS: notification parity/);
assert.match(readFileSync(`${root}/mention-bound.txt`, 'utf8'), /PASS: maximum 500-friend circle/);
const measurements = [
  'validated-normal-5m',
  'validated-launch-heavy-20m',
  'validated-app-shape-heavy-60s',
  'validated-recovery-60s',
].map((name) => {
  const p = json(name);
  return {
    name,
    seconds: p.seconds,
    completed: p.completed,
    skipped: p.skipped,
    failed: p.failed,
    sqlTimeouts: p.sqlTimeouts,
    aborted: p.aborted,
    perScript: p.perScript,
  };
});
const tempDeltas: Record<
  string,
  {
    sampledTempBytesDelta: number;
    samples: number;
    maxSampledBlocked: number;
    deadlockDelta: number;
  }
> = {};
for (const name of ['validated-normal-5m', 'validated-launch-heavy-20m']) {
  const samples = metricSamples(readFileSync(`${root}/${name}-samples.json`, 'utf8'));
  const first = samples[0],
    last = samples.at(-1);
  assert.ok(first && last, 'At least one measured sample required');
  tempDeltas[name] = {
    sampledTempBytesDelta: last.temp_bytes - first.temp_bytes,
    samples: samples.length,
    maxSampledBlocked: Math.max(...samples.map((x) => x.blocked)),
    deadlockDelta: last.deadlocks - first.deadlocks,
  };
}
const summary = {
  at: new Date().toISOString(),
  localOnly: true,
  productionLoad: false,
  providerRequests: 0,
  productionCapacityCertified: false,
  gates,
  measurements,
  tempDeltas,
  replay,
  rollback,
  sourceHashes: {
    functions: hash('docs/drafts/member_query_performance_v1.sql'),
    indexes: hash('docs/drafts/member_query_performance_indexes_v1.sql'),
  },
};
writeFileSync(`${root}/summary.json`, JSON.stringify(summary, null, 2));
console.log(
  JSON.stringify({
    gates: gates.map((x) => ({ name: x.name, passed: x.passed })),
    measurements: measurements.map(({ perScript, ...p }) => p),
    tempDeltas,
  }),
);
