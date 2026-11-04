import {
  validWorkflowBatch,
  validWorkflowPair,
  workflowPhases,
  workflowOutcomes,
} from '../../contracts/mobileWorkflowTelemetry';

const now = 1793760000000;
const row = { phase: 'receipt', outcome: 'confirmed', count: 1, capped: false };
const batch = { id: 'wf:synthetic-batch-0001', issuedAt: now, platform: 'ios', rows: [row] };

test('the complete fixed category matrix excludes invented outcomes and feed confirmation', () => {
  for (const phase of workflowPhases) {
    for (const outcome of workflowOutcomes) {
      const valid =
        (outcome !== 'rendered' || phase === 'feed') &&
        (phase !== 'feed' || outcome !== 'confirmed');
      expect(validWorkflowPair(phase, outcome)).toBe(valid);
      expect(validWorkflowBatch({ ...batch, rows: [{ ...row, phase, outcome }] }, now)).toBe(valid);
    }
  }
  expect(validWorkflowPair('private answer', 'confirmed')).toBe(false);
  expect(validWorkflowPair('receipt', 'invented')).toBe(false);
  expect(validWorkflowBatch({ ...batch, platform: 'android', issuedAt: now - 300000 }, now)).toBe(
    true,
  );
  expect(
    validWorkflowBatch(
      { ...batch, issuedAt: now + 30000, rows: [{ ...row, count: 15000, capped: true }] },
      now,
    ),
  ).toBe(true);
});

test.each([
  null,
  [],
  'private',
  {},
  { ...batch, extra: 'private' },
  { ...batch, id: null },
  { ...batch, id: 'bad' },
  { ...batch, issuedAt: 1.5 },
  { ...batch, issuedAt: now - 300001 },
  { ...batch, issuedAt: now + 30001 },
  { ...batch, platform: 'web' },
  { ...batch, rows: null },
  { ...batch, rows: [] },
  { ...batch, rows: Array(31).fill(row) },
  { ...batch, rows: [row, row] },
  ...[
    null,
    [],
    'private',
    {},
    { ...row, extra: 'private' },
    { ...row, phase: 'private' },
    { ...row, count: '1' },
    { ...row, count: 1.5 },
    { ...row, count: 0 },
    { ...row, count: 15001 },
    { ...row, capped: 'false' },
  ].map((value) => ({ ...batch, rows: [value] })),
])('rejects malformed, private, replay-shaped or oversized batches %#', (value) => {
  expect(validWorkflowBatch(value, now)).toBe(false);
});

test('invalid local clocks never admit a batch', () => {
  for (const clock of [NaN, Infinity, now + 0.5])
    expect(validWorkflowBatch(batch, clock)).toBe(false);
});
