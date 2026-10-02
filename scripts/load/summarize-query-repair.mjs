import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root='test-results/local-query-repair-20260928';
const json=name=>JSON.parse(readFileSync(`${root}/${name}.json`,'utf8'));
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const gates=['ramp','soak','app-shape','recovery'].map(name=>({name,...json(`${name}-gate`)}));
for(const gate of gates)assert.equal(gate.passed,true,`${gate.name} failed`);
const heavy=json('validated-launch-heavy-20m');
assert.equal(heavy.seconds,1200);assert.ok(heavy.wallMs>=1200000);
const replay=json('concurrency');assert.equal(replay.mentionAlertIntents,1);
const rollback=json('rollback-verification');assert.equal(rollback.exactRollback,true);assert.equal(rollback.exactReapply,true);
assert.match(readFileSync(`${root}/parity.txt`,'utf8'),/PASS: notification parity/);
assert.match(readFileSync(`${root}/mention-bound.txt`,'utf8'),/PASS: maximum 500-friend circle/);
const measurements=['validated-normal-5m','validated-launch-heavy-20m','validated-app-shape-heavy-60s','validated-recovery-60s'].map(name=>{
 const p=json(name);return {name,seconds:p.seconds,completed:p.completed,skipped:p.skipped,failed:p.failed,sqlTimeouts:p.sqlTimeouts,aborted:p.aborted,perScript:p.perScript};
});
const tempDeltas={};
for(const name of ['validated-normal-5m','validated-launch-heavy-20m']){
 const samples=json(`${name}-samples`).filter(x=>Number.isFinite(x.temp_bytes));
 tempDeltas[name]={sampledTempBytesDelta:samples.at(-1).temp_bytes-samples[0].temp_bytes,samples:samples.length,maxSampledBlocked:Math.max(...samples.map(x=>x.blocked)),deadlockDelta:samples.at(-1).deadlocks-samples[0].deadlocks};
}
const summary={at:new Date().toISOString(),localOnly:true,productionLoad:false,providerRequests:0,productionCapacityCertified:false,gates,measurements,tempDeltas,replay,rollback,
 sourceHashes:{functions:hash('docs/drafts/member_query_performance_v1.sql'),indexes:hash('docs/drafts/member_query_performance_indexes_v1.sql')}};
writeFileSync(`${root}/summary.json`,JSON.stringify(summary,null,2));
console.log(JSON.stringify({gates:gates.map(x=>({name:x.name,passed:x.passed})),measurements:measurements.map(({perScript,...p})=>p),tempDeltas}));
