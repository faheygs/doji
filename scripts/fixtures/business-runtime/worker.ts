// Complete business composition in a network-disabled real Edge runtime.
import pg from '../../../infra/portal-identity/node_modules/pg/lib/index.js';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { businessFixture, businessConfig } from '../../business-runtime-fixture.mts';
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
    // The bundle banner supports CommonJS dependencies only. It must not mask
    // missing explicit Node imports in our own Deno application modules.
    Reflect.deleteProperty(globalThis, 'Buffer');
    assert.equal(typeof Reflect.get(globalThis, 'Buffer'), 'undefined');
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
    const ownedAuth = {
      enabled: true,
      sendingEnabled: true,
      admissionHmacKey: 'cd'.repeat(32),
      operationHmacKey: 'de'.repeat(32),
      webhookSecret: 'synthetic-reset-webhook-'.repeat(3),
      recoveryEmail: {
        enabled: true,
        workosDefaultEmailDisabled: true,
        trackingDisabled: true,
        capacityApprovedUntil: Date.now() + 3600000,
        apiKey: 're_' + 'x'.repeat(24),
        from: 'Doji <support@dojipro.com>',
      },
    };
    const owned = await businessFixture({ ownedAuth });
    const bootstrap = await owned.runtime(owned.request('/auth/owned/bootstrap'));
    assert.equal(bootstrap.status, 200);
    const binding = bootstrap.headers.getSetCookie()[0]?.split(';')[0];
    const bootstrapBody = await bootstrap.json();
    assert.ok(binding && typeof bootstrapBody.csrf === 'string');
    const submit = async (action: string, fields: Record<string, string>) => {
      owned.proofAction(`business_${action}`);
      return owned.runtime(
        owned.request(`/auth/owned/${action}`, { ...fields, proof: 'synthetic' }, binding, {
          'x-doji-csrf': bootstrapBody.csrf,
        }),
      );
    };
    const signin = await submit('signin', {
      email: 'sample@example.com',
      password: 'synthetic-password',
    });
    assert.equal(signin.status, 200);
    assert.deepEqual(await signin.json(), { step: 'complete' });
    const ownedCookie = signin.headers
      .getSetCookie()
      .find((value) => value.startsWith('__Host-doji_business='))
      ?.split(';')[0];
    assert.ok(ownedCookie);
    assert.equal(
      (await owned.runtime(owned.request('/api/session', undefined, ownedCookie))).status,
      200,
    );
    assert.equal((await submit('recover', { email: 'sample@example.com' })).status, 200);
    assert.deepEqual(
      await (
        await submit('reset', { token: 'synthetic-reset-token-123456', password: 'new-password' })
      ).json(),
      { step: 'reset-done' },
    );
    assert.equal(
      (await owned.runtime(owned.request('/api/session', undefined, ownedCookie))).status,
      401,
    );
    assert.equal(owned.calls.filter((url) => url.endsWith('/password_reset/confirm')).length, 1);
    const eventBody = JSON.stringify({
      id: 'event_synthetic',
      event: 'password_reset.succeeded',
      context: { client_id: businessConfig.clientId },
      data: { object: 'password_reset', id: 'password_reset_synthetic', user_id: 'user_synthetic' },
    });
    const timestamp = Date.now();
    const signature = createHmac('sha256', 'synthetic-reset-webhook-'.repeat(3))
      .update(`${timestamp}.${eventBody}`)
      .digest('hex');
    const webhook = await owned.runtime(
      new Request(businessConfig.endpoint + '/auth/owned/reset-events', {
        method: 'POST',
        headers: {
          'x-doji-portal-proxy-key': businessConfig.proxyKey,
          'content-type': 'application/json',
          'workos-signature': `t=${timestamp}, v1=${signature}`,
        },
        body: eventBody,
      }),
    );
    assert.equal(webhook.status, 200);
    const registration = await businessFixture({
      signupEnabled: false,
      ownedAuth: { ...ownedAuth, acceptanceOnly: true },
    });
    const regBootstrap = await registration.runtime(registration.request('/auth/owned/bootstrap'));
    const regBinding = regBootstrap.headers.getSetCookie()[0]?.split(';')[0];
    const regCsrf = (await regBootstrap.json()).csrf;
    assert.ok(regBinding);
    registration.proofAction('business_register');
    const registered = await registration.runtime(
      registration.request(
        '/auth/owned/register',
        {
          email: 'sample@example.com',
          password: 'synthetic-password',
          proof: 'synthetic',
          termsAccepted: true,
          privacyAcknowledged: true,
          country: 'US',
          termsVersion: businessConfig.termsVersion,
          privacyVersion: businessConfig.privacyVersion,
        },
        regBinding,
        { 'x-doji-csrf': regCsrf },
      ),
    );
    assert.equal(registered.status, 200);
    assert.deepEqual(await registered.json(), { step: 'verify' });
    return Response.json({
      passed: true,
      driverLoaded: true,
      callback: 303,
      session: 200,
      application: 200,
      revoked: 401,
      ownedSignin: 200,
      ownedReset: 'reset-done',
      ownedResetRevokedSession: 401,
      noAmbientBuffer: true,
      signedResetWebhook: webhook.status,
      ownedRegistration: registered.status,
      externalRequests: 0,
    });
  } catch (error) {
    return Response.json({ passed: false, error: String(error) }, { status: 500 });
  }
});
