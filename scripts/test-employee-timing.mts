import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmployeeTiming } from '../infra/portal-identity-candidate/employee-timing.mts';
test('timing is request-local across overlapping requests and contains only fixed labels', async () => {
  const timing = createEmployeeTiming();
  let release: () => void = () => assert.fail('Promise resolver not initialized');
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = timing.request(async () => {
    await timing.measure('identity', () => blocked);
    return new Response(null);
  });
  const second = await timing.request(async () => new Response(null));
  assert.match(
    second.headers.get('server-timing') ?? '',
    /connect;dur=0, query;dur=0, close;dur=0, identity;dur=0$/,
  );
  release();
  assert.match(
    (await first).headers.get('server-timing') ?? '',
    /^total;dur=\d+, connect;dur=0, query;dur=0, close;dur=0, identity;dur=\d+$/,
  );
  await assert.rejects(
    () => Reflect.apply(timing.measure, timing, ['SECRET', () => {}]),
    /Unknown/,
  );
});
test('rejected operations keep their error and bounded timing does not leak it', async () => {
  const timing = createEmployeeTiming();
  const error = Error('secret');
  const response = await timing.request(async () => {
    await assert.rejects(
      timing.measure('query', async () => {
        throw error;
      }),
      (e) => e === error,
    );
    return new Response(null, { status: 503 });
  });
  assert.equal(response.status, 503);
  const header = response.headers.get('server-timing');
  assert.ok(header);
  assert.ok(!header.includes('secret'));
});
