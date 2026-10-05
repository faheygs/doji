import { execFileSync } from 'node:child_process';
import { root, engine } from './config.mts';
import { errorOutput } from './contracts.mts';
import type { TestRoom, SuiteResult } from './contracts.mts';

// Explicit offline allowlist. Never glob release/provider scripts into CI.
export const suites: [string, ...string[]][] = [
  ['scripts/test-business-foundation.mts'],
  ['scripts/test-business-foundation.mts', '--identity-candidate'],
  ['scripts/test-portal-identity-business-reads.mts'],
  ['scripts/test-portal-identity-business-commands.mts'],
  ['scripts/test-portal-identity-business-enrollment.mts'],
  ['scripts/test-safety-removal-local.mts'],
  ['scripts/test-moderation-media-ledger.mts'],
  ['scripts/test-moderation-media-restoration.mts'],
  ['scripts/test-portal-employee-actors.mts'],
  ['scripts/test-employee-rpc-bridge.mts'],
  ['scripts/check-employee-durable-session.mts'],
  ['scripts/check-business-durable-session.mts'],
];
export function extended(room: TestRoom) {
  const results = [];
  for (const args of suites) {
    room.inspect();
    const entry: SuiteResult = { suite: args.join(' '), status: 'failed' };
    try {
      entry.output = execFileSync(process.execPath, args, {
        cwd: root,
        env: { ...process.env, DOJI_TEST_ENGINE: engine, DOJI_CLEAN_ROOM_CONTAINER: room.name },
        encoding: 'utf8',
        timeout: 120000,
        maxBuffer: 2 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
        .trim()
        .slice(-12000);
      entry.status = 'passed';
      console.log(`PASS: ${entry.suite}`);
    } catch (error) {
      entry.output = errorOutput(error, 'stderr').slice(-10000);
      console.error(`FAIL: ${entry.suite}\n${entry.output}`);
    }
    results.push(entry);
  }
  return results;
}
