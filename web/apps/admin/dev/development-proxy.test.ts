// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createDevelopmentProxy } from './development-proxy';
import {
  developmentEndpoint,
  createDevelopmentGateway,
} from '../../../../infra/portal-identity/admin-development.mts';
import { localAdminOrigin } from './transport';

const token = 'a'.repeat(43);
const admin = '98000000-0000-4000-8000-000000000001';
const moderator = '98000000-0000-4000-8000-000000000002';
describe('development relay with real gateway', () => {
  it('accepts the bounded employee directory beyond the old 25-persona limit', async () => {
    let count = 100;
    const proxy = createDevelopmentProxy(token, async () =>
      Response.json({
        developer: 'test',
        personas: Array.from({ length: count }, (_, n) => ({
          id: String(n),
          label: 'Employee ' + n,
        })),
      }),
    );
    const send = () =>
      proxy.handle(
        new Request(localAdminOrigin + '/api/dev/personas', {
          headers: { 'sec-fetch-site': 'same-origin' },
        }),
      );
    expect((await (await send()).json()).personas).toHaveLength(100);
    count = 101;
    expect((await send()).status).toBe(503);
    proxy.dispose();
  });
  it('authenticates server-side, rotates persona CSRF, denies stale tabs and revocation', async () => {
    let revoked = false;
    const calls: string[] = [];
    const gateway = createDevelopmentGateway(async (credential, call) => {
      expect(credential).toBe(token);
      calls.push(call.name);
      if (revoked) throw Object.assign(Error('revoked'), { status: 401 });
      if (call.name === 'personas')
        return {
          developer: 'Test developer',
          personas: [
            { id: admin, label: 'Admin' },
            { id: moderator, label: 'Moderator' },
          ],
        };
      if (call.name === 'get_admin_portal_session_v3')
        return { ok: true, result: { user_id: call.persona, capabilities: {} } };
      return { ok: false, code: '42501' };
    });
    const proxy = createDevelopmentProxy(token, async (input, options) => {
      expect(String(input)).toBe(developmentEndpoint);
      return gateway(new Request(input, options));
    });
    let cookie = '',
      csrf = '';
    const send = async (path: string, body?: object, headers: Record<string, string> = {}) => {
      const response = await proxy.handle(
        new Request(localAdminOrigin + '/api/dev/' + path, {
          method: body ? 'POST' : 'GET',
          headers: {
            origin: localAdminOrigin,
            'sec-fetch-site': 'same-origin',
            'content-type': 'application/json',
            cookie,
            'x-doji-csrf': csrf,
            ...headers,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      );
      if (response.headers.has('set-cookie'))
        cookie = response.headers.get('set-cookie')!.split(';')[0]!;
      return response;
    };
    const list = await (await send('personas')).json();
    csrf = list.csrf;
    expect(JSON.stringify(list)).not.toContain(token);
    expect(cookie).not.toContain(token);
    expect((await send('select', { persona: admin }, { origin: 'https://evil.test' })).status).toBe(
      403,
    );
    const before = csrf;
    csrf = (await (await send('select', { persona: admin })).json()).csrf;
    expect(csrf).not.toBe(before);
    expect((await send('session', undefined, { 'x-doji-csrf': before })).status).toBe(401);
    expect((await (await send('session')).json()).operator.user_id).toBe(admin);
    const adminCsrf = csrf;
    csrf = (await (await send('select', { persona: moderator })).json()).csrf;
    expect(
      (await send('rpc', { name: 'admin_write', args: {} }, { 'x-doji-csrf': adminCsrf })).status,
    ).toBe(401);
    expect((await send('rpc', { name: 'admin_write', args: {} })).status).toBe(403);
    revoked = true;
    expect((await send('session')).status).toBe(401);
    const count = calls.length;
    expect((await send('rpc', { name: 'admin_write', args: {} })).status).toBe(401);
    expect(calls).toHaveLength(count);
    proxy.dispose();
  });
  it('refuses missing credentials, arbitrary routes, cross-site access and unbounded bodies', async () => {
    expect(() => createDevelopmentProxy('')).toThrow('DOJI_ADMIN_DEVELOPMENT_TOKEN');
    let calls = 0;
    const proxy = createDevelopmentProxy(token, async () => {
      calls++;
      throw Error('Unexpected request');
    });
    for (const url of [
      localAdminOrigin + '/api/dev/personas?token=x',
      'https://admin.dojipro.com/api/dev/personas',
      localAdminOrigin + '/api/session',
    ])
      expect((await proxy.handle(new Request(url))).status).toBe(404);
    expect((await proxy.handle(new Request(localAdminOrigin + '/api/dev/personas'))).status).toBe(
      403,
    );
    expect(calls).toBe(0);
  });
  it('does not switch or replay while a write is still in flight', async () => {
    let release!: () => void;
    let writes = 0;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const proxy = createDevelopmentProxy(token, async (_input, options) => {
      const call = JSON.parse(String(options?.body));
      if (call.name === 'personas')
        return Response.json({ developer: 'test', personas: [{ id: admin, label: 'Admin' }] });
      if (call.name === 'get_admin_portal_session_v3') return Response.json({ user_id: admin });
      writes++;
      await pending;
      return Response.json({ saved: true });
    });
    const send = (path: string, cookie = '', csrf = '', body?: object) =>
      proxy.handle(
        new Request(localAdminOrigin + '/api/dev/' + path, {
          method: body ? 'POST' : 'GET',
          headers: {
            origin: localAdminOrigin,
            'sec-fetch-site': 'same-origin',
            cookie,
            'x-doji-csrf': csrf,
            'content-type': 'application/json',
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      );
    const list = await send('personas');
    const cookie = list.headers.get('set-cookie')!.split(';')[0]!;
    const csrf = (await list.json()).csrf;
    const active = (await (await send('select', cookie, csrf, { persona: admin })).json()).csrf;
    const write = send('rpc', cookie, active, { name: 'command', args: {} });
    await Promise.resolve();
    expect((await send('select', cookie, active, { persona: moderator })).status).toBe(409);
    release();
    expect((await write).status).toBe(200);
    expect(writes).toBe(1);
    proxy.dispose();
  });
});
