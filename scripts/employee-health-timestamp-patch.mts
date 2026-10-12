// Narrow backport against the captured deployed runtime; not the broader candidate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export const deployedHealthSha256 =
  'b064d658d9a7ff195a57d7fc046f51b91c4f5da4e3cd2d13e9526dbfacacc88e';
export function patchEmployeeHealthTimestamp(bytes: Buffer) {
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    deployedHealthSha256,
    'Employee health baseline changed; recapture and review before preparing',
  );
  const source = bytes.toString('utf8');
  const before = '    const promise = Promise.resolve().then(load);';
  assert.equal(source.split(before).length, 2);
  // Stamp only a successful, validated provider observation, after body parsing.
  // Leave operations snapshots and all cache TTLs/authorization untouched.
  return source.replace(
    before,
    [
      '    const promise = Promise.resolve().then(load).then((value) =>',
      "      kind === 'sentry' && value.available === true",
      '        ? { ...value, observed_at: new Date(now()).toISOString() }',
      '        : value,',
      '    );',
    ].join(source.includes('\r\n') ? '\r\n' : '\n'),
  );
}
