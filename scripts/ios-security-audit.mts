// Read-only registry audit of both immutable release snapshots; never npm audit fix.
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { writeFileSync } from 'node:fs';
import {evidenceRecord,evidenceArray} from './release-evidence.mts';
const npm = resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const output = resolve('test-results/ios-security-103');
for (const [name, cwd] of [['baseline', 'test-results/mobile-release-20261002/upload'], ['patched', 'test-results/ios-security-103/upload']] as const) {
  const result = spawnSync(process.execPath, [npm, 'audit', '--omit=dev', '--json'], { cwd: resolve(cwd), encoding: 'utf8', timeout: 60000, maxBuffer: 8e6 });
  if (result.error) throw result.error;
  const audit = JSON.parse(result.stdout);
  if (audit.error || !audit.metadata) throw new Error('Audit unavailable');
  writeFileSync(resolve(output, `audit-${name}.json`), JSON.stringify(audit, null, 2));
  const direct = Object.values(evidenceRecord(audit.vulnerabilities)).flatMap(value => {const v=evidenceRecord(value);if(!Array.isArray(v.via))throw Error('Missing advisory links');return evidenceArray(v.via.filter((x:unknown)=>typeof x==='object')).map(a => ({ package: v.name, title: a.title, url: a.url, severity: a.severity, range: a.range }));});
  console.log(JSON.stringify({ name, counts: audit.metadata.vulnerabilities, advisories: direct }));
}
