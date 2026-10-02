import { execFileSync } from 'node:child_process';
import { root, engine } from './config.mjs';

// Explicit offline allowlist. Never glob release/provider scripts into CI.
export const suites = [
  ['scripts/test-business-foundation.mjs'],
  ['scripts/test-business-foundation.mjs', '--identity-candidate'],
  ['scripts/test-portal-identity-business-reads.mjs'],
  ['scripts/test-portal-identity-business-commands.mjs'],
  ['scripts/test-portal-identity-business-enrollment.mjs'],
  ['scripts/test-safety-removal-local.mjs'],
  ['scripts/test-moderation-media-ledger.mjs'],
  ['scripts/test-moderation-media-restoration.mjs'],
  ['scripts/test-portal-employee-actors.mjs'],
  ['scripts/test-employee-rpc-bridge.mjs'],
  ['scripts/check-employee-durable-session.mjs'],
  ['scripts/check-business-durable-session.mjs'],
];
export function extended(room) {
  const results = [];
  for (const args of suites) {
    room.inspect();
    const entry = { suite: args.join(' '), status: 'failed' };
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
      entry.output = String(error.stderr || error.message).slice(-10000);
      console.error(`FAIL: ${entry.suite}\n${entry.output}`);
    }
    results.push(entry);
  }
  return results;
}
