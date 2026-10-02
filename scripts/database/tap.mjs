import assert from 'node:assert/strict';
export function verifyTap(output) {
  assert.doesNotMatch(output, /(^|\n)(not ok\b|Bail out!|# Looks like|# No tests run)/i);
  const plans = [...output.matchAll(/^1\.\.([0-9]+)\s*$/gm)];
  assert.equal(plans.length, 1, 'Exactly one non-skipped TAP plan is required');
  const planned = Number(plans[0][1]);
  assert.ok(planned > 0, 'Empty test suites cannot pass');
  const assertions = [...output.matchAll(/^ok\s+(\d+)([^\n]*)$/gm)];
  assert.equal(assertions.length, planned, 'Missing TAP assertions');
  assertions.forEach((item, index) => {
    assert.equal(Number(item[1]), index + 1, 'TAP assertions must be complete and sequential');
    assert.doesNotMatch(
      item[2],
      /#\s*(skip|todo)\b/i,
      'Skipped/TODO database checks cannot pass CI',
    );
  });
  return planned;
}
