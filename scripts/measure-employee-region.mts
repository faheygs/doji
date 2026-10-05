// Bounded missing-session lookup only. No real employee cookies or provider grants.
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { evidenceRecord } from './release-evidence.mts';
const config = evidenceRecord(
  JSON.parse(await readFile('.artifacts/employee-runtime/runtime.json', 'utf8')),
);
assert.ok(
  typeof config.origin === 'string' && typeof config.proxyKey === 'string',
  'Invalid employee runtime configuration',
);
const endpoint = 'https://tvixsmqxotuvyjqzmjla.supabase.co/functions/v1/employee-portal-v2';
for (const region of [null, 'us-west-2', null, 'us-west-2']) {
  const start = performance.now();
  const response: Response = await fetch(endpoint + '/api/session', {
    headers: {
      origin: config.origin,
      'x-doji-portal-proxy-key': config.proxyKey,
      'x-doji-client-ip': '192.0.2.1',
      cookie: `__Host-doji_employee=${randomBytes(32).toString('base64url')}`,
      ...(region ? { 'x-region': region } : {}),
    },
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  await response.arrayBuffer();
  console.log(
    JSON.stringify({
      requestedRegion: region || 'automatic',
      actualRegion: response.headers.get('x-sb-edge-region'),
      status: response.status,
      ms: Math.round(performance.now() - start),
      timing: response.headers.get('server-timing'),
    }),
  );
  assert.equal(response.status, 401);
}
