// Complete business composition in a network-disabled real Edge runtime.
import pg from '../../../infra/portal-identity-candidate/node_modules/pg/lib/index.js';
import assert from 'node:assert/strict';
import { businessFixture } from '../../business-runtime-fixture.mts';
Deno.serve(async () => {
  try {
    const driver = new pg.Client({ ssl: { rejectUnauthorized: true } });
    const parameters: unknown = Reflect.get(driver, 'connectionParameters');
    assert.ok(parameters && typeof parameters === 'object' && 'ssl' in parameters);
    const ssl = parameters.ssl;
    assert.ok(
      ssl &&
        typeof ssl === 'object' &&
        'rejectUnauthorized' in ssl &&
        ssl.rejectUnauthorized === true,
    );
    const fixture = await businessFixture();
    const callback = await fixture.runtime(await fixture.begin());
    assert.equal(callback.status, 303);
    assert.ok(callback.headers.get('location')?.endsWith('/application/'));
    const cookie = callback.headers
      .getSetCookie()
      .find((value) => value.startsWith('__Host-doji_business='))
      ?.split(';')[0];
    assert.ok(cookie);
    const session = await fixture.runtime(fixture.request('/api/session', undefined, cookie));
    assert.equal(session.status, 200);
    assert.equal(
      (await fixture.runtime(fixture.request('/api/application', undefined, cookie))).status,
      200,
    );
    fixture.revoke();
    assert.equal(
      (await fixture.runtime(fixture.request('/api/session', undefined, cookie))).status,
      401,
    );
    return Response.json({
      passed: true,
      driverLoaded: true,
      callback: 303,
      session: 200,
      application: 200,
      revoked: 401,
      externalRequests: 0,
    });
  } catch (error) {
    return Response.json({ passed: false, error: String(error) }, { status: 500 });
  }
});
