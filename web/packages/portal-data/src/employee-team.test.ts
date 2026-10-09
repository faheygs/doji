import { describe, expect, it } from 'vitest';
import {
  employeeDirectory,
  readEmployeeTeam,
  validEmployeeRoleInput,
  type EmployeeRoleInput,
} from './employee-team';
import { createEmployeeSession } from './employee-session';
import { assertEmployeeRead } from './employee-read-policy';
import { teamActor, teamFixture, teamKey } from '../../../tests/team-fixture';
const input: EmployeeRoleInput = {
  username: 'employee@example.test',
  role: 'operations',
  active: true,
  reason: 'Approved synthetic coverage.',
  idempotencyKey: teamKey,
};
async function fixture(manage = true) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  let value: unknown = {
    status: 'active',
    roles: ['operations'],
    changed_role: 'operations',
    granted: true,
  };
  let delay: (() => Promise<void>) | undefined;
  const controller = createEmployeeSession(
    { independentEmployeeIdentity: true },
    {
      origin: 'https://admin.dojipro.com',
      upstream: async (url, init) => {
        if (url.endsWith('/api/session'))
          return Response.json({
            signedIn: true,
            assurance: 'aal2',
            csrf: 'c'.repeat(43),
            operator: { user_id: teamActor, capabilities: { operator_manage: manage } },
          });
        if (url.endsWith('/auth/logout')) return Response.json({ signedOut: true });
        calls.push(JSON.parse(String(init?.body)) as (typeof calls)[number]);
        await delay?.();
        return Response.json(value);
      },
    },
  );
  await controller.restore();
  return {
    controller,
    calls,
    respond: (v: unknown) => {
      value = v;
    },
    delay: (fn: () => Promise<void>) => {
      delay = fn;
    },
  };
}
const signal = () => new AbortController().signal;
describe('employee-only access management', () => {
  it('strictly projects at most 100 employees without extra contact/provider fields', () => {
    const source = teamFixture();
    Object.assign(source.items[0]!, { token: 'never retain' });
    expect(employeeDirectory(source)[0]).not.toHaveProperty('token');
    for (const invalid of [
      {},
      { items: Array(101).fill(source.items[0]) },
      { items: [source.items[0], source.items[0]] },
      { items: [{ ...source.items[0], roles: ['owner'] }] },
      { items: [{ ...source.items[0], status: 'unknown' }] },
    ])
      expect(() => employeeDirectory(invalid)).toThrow();
  });
  it('requires exact read routes and access-management permission', async () => {
    expect(() => assertEmployeeRead('/portal/admin/operators', false)).not.toThrow();
    expect(() => assertEmployeeRead('/portal/admin/operators?all=1', false)).toThrow();
    expect(() => assertEmployeeRead('/portal/admin/operator-role', true)).toThrow();
    const f = await fixture(false);
    await expect(readEmployeeTeam(f.controller, signal())).rejects.toThrow('permission');
    await expect(f.controller.changeEmployeeRole(input, signal())).rejects.toThrow('permission');
    expect(f.calls).toEqual([]);
    await f.controller.signOut();
  });
  it('sends one exact independent employee command and verifies the receipt', async () => {
    const f = await fixture();
    await expect(f.controller.changeEmployeeRole(input, signal())).resolves.toEqual({
      recorded: true,
    });
    expect(f.calls).toEqual([
      {
        name: 'admin_set_employee_role_v1',
        args: {
          p_username: input.username,
          p_role: input.role,
          p_active: true,
          p_reason: input.reason,
          p_idempotency_key: teamKey,
        },
      },
    ]);
    f.respond({
      status: 'active',
      roles: ['operations'],
      changed_role: 'moderator',
      granted: true,
    });
    await expect(f.controller.changeEmployeeRole(input, signal())).rejects.toThrow('verified');
    await f.controller.signOut();
  });
  it('rejects malformed identities, arbitrary payloads and missing rationale', () => {
    expect(validEmployeeRoleInput(input)).toBe(true);
    for (const change of [
      { username: ' member@example.test' },
      { role: 'owner' },
      { reason: '' },
      { idempotencyKey: 'short' },
      { actor: teamActor },
    ])
      expect(validEmployeeRoleInput({ ...input, ...change } as EmployeeRoleInput)).toBe(false);
  });
  it('fences late role-command outcomes after logout', async () => {
    const f = await fixture();
    let release = () => {};
    f.delay(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const pending = f.controller.changeEmployeeRole(input, signal());
    while (!f.calls.length) await new Promise((resolve) => setTimeout(resolve, 0));
    const denied = expect(pending).rejects.toThrow();
    const logout = f.controller.signOut();
    release();
    await denied;
    await logout;
    expect(f.controller.getSnapshot().cache).toBeNull();
  });
});
