import { newCommandId, occurrenceCommandId, runSingleFlight } from '../../lib/idempotency';

describe('newCommandId', () => {
  it('preserves the command prefix and satisfies the database minimum length', () => {
    const id = newCommandId('reaction');
    expect(id.startsWith('reaction:')).toBe(true);
    expect(id.length).toBeGreaterThan(16);
  });

  it('does not collide for commands generated in the same runtime', () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => newCommandId('command')));
    expect(ids.size).toBe(10_000);
  });
});

describe('occurrence idempotency', () => {
  it('uses one stable command ID for the same Doji occurrence', () => {
    expect(occurrenceCommandId('poll-vote', 'event-123')).toBe(
      occurrenceCommandId('poll-vote', 'event-123'),
    );
  });

  it('runs concurrent duplicate commands only once', async () => {
    let calls = 0;
    const operation = async () => {
      calls += 1;
      await Promise.resolve();
      return 'done';
    };

    const [first, second, third] = await Promise.all([
      runSingleFlight('poll-vote:occurrence:event-123', operation),
      runSingleFlight('poll-vote:occurrence:event-123', operation),
      runSingleFlight('poll-vote:occurrence:event-123', operation),
    ]);

    expect([first, second, third]).toEqual(['done', 'done', 'done']);
    expect(calls).toBe(1);
  });

  it('allows a deliberate retry after the prior attempt finishes', async () => {
    let calls = 0;
    const operation = async () => ++calls;
    await expect(runSingleFlight('retryable-command', operation)).resolves.toBe(1);
    await expect(runSingleFlight('retryable-command', operation)).resolves.toBe(2);
  });
});
