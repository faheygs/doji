/** Local export only: never creates a cloud build or uploads source maps. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
const require = createRequire(import.meta.url);
const platform = process.argv[2];
assert.ok(platform === 'ios' || platform === 'android', 'Specify ios or android');
const root = resolve('test-results/push-recovery-20261008-v3', platform);
const output = join(root, 'bundle');
if (process.argv[3] !== '--verify-existing') {
  assert.ok(!existsSync(root), 'Preserve existing local export evidence');
  mkdirSync(root, { recursive: true });
  require('@expo/env').load('D:/ChallengeApp/DoIt', { silent: true });
  const log = execFileSync(process.execPath, [resolve('node_modules/expo/bin/cli'), 'export',
    '--platform', platform, '--output-dir', output, '--no-bytecode', '--source-maps', '--max-workers', '2'], {
    cwd: process.cwd(), timeout: 600_000, maxBuffer: 12e6, encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'production', CI: '1', EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1',
      SENTRY_DISABLE_AUTO_UPLOAD: 'true', SENTRY_AUTH_TOKEN: '' },
  });
  writeFileSync(join(root, 'export.log'), log, { flag: 'wx' });
}
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
}
type MapData = { debug_id?: string; debugId?: string; sources: string[]; sourcesContent: string[] };
type Position = { source: string; line: number; column: number };
type Consumer = { generatedPositionFor(position: Position): { line: number | null; column: number | null };
  originalPositionFor(position: { line: number; column: number }): Position };
const { SourceMapConsumer } = require('source-map') as { SourceMapConsumer: new (map: MapData) => Consumer };
const maps = walk(output).filter(file => file.endsWith('.map'));
const verified: { debugId: string; mappedSource: string; originalLine: number; generatedLine: number }[] = [];
for (const file of maps) {
  const map = JSON.parse(readFileSync(file, 'utf8')) as MapData;
  const index = map.sources.findIndex(source => /(?:^|\/)lib\/apiFailureTelemetry\.ts$/.test(source));
  if (index < 0) continue;
  const id = map.debug_id ?? map.debugId;
  assert.match(id ?? '', /^[a-f0-9-]{36}$/, 'Source map needs a Debug ID');
  const bundle = readFileSync(file.slice(0, -4), 'utf8');
  assert.ok(bundle.includes('_sentryDebugIds') && bundle.includes(id!), 'Runtime injection must match source map');
  for (const module of ['pushRegistrationRecovery', 'pushRegistrationScope', 'pushRegistrationCancellation',
    'commandGatewayTransport', 'pushRegistrationStorage', 'supportDiagnostics']) {
    assert.ok(map.sources.some(source => source.endsWith(`/lib/${module}.ts`)), `Missing ${module}`);
  }
  assert.ok(map.sources.some(source => source.endsWith('/profile/report-problem.tsx')), 'Missing support screen');
  const content = map.sourcesContent[index]!;
  const line = content.split('\n').findIndex(text => text.includes('Sentry.captureException')) + 1;
  assert.ok(line > 0, 'Find the actual error-capture source line');
  const consumer = new SourceMapConsumer(map);
  const column = content.split('\n')[line - 1]!.indexOf('Sentry.captureException');
  const position = consumer.generatedPositionFor({ source: map.sources[index]!, line, column });
  assert.ok(position.line != null && position.column != null, 'Source must map into the generated bundle');
  const original = consumer.originalPositionFor({ line: position.line, column: position.column });
  assert.equal(original.source, map.sources[index]);
  assert.equal(original.line, line);
  verified.push({ debugId: id!, mappedSource: 'lib/apiFailureTelemetry.ts', originalLine: line, generatedLine: position.line });
}
assert.ok(verified.length > 0, 'No application source map verified');
const proof = { at: new Date().toISOString(), platform, localExportOnly: true, source: 'working checkout, not a frozen release',
  cloudBuildStarted: false, sourceMapsUploaded: false, deviceAcceptance: false, liveSymbolicationVerified: false, verified };
writeFileSync(join(root, 'proof.json'), JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(proof));
