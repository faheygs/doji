import test from 'node:test';
import assert from 'node:assert/strict';
import { developmentGate, buildAdminDevelopmentSql } from './build-admin-development-sql.mts';
import { employeeRouteContracts } from '../infra/portal-identity/employee-route-contracts.mts';
import { employeeHistoryContracts } from '../infra/portal-identity/employee-history-contracts.mts';
import { employeeAnnouncementContract } from '../infra/portal-identity/employee-announcement-contracts.mts';

test('development authority substitutes only reviewed employee assurance guards', () => {
  for (const condition of [
    "auth.jwt()->>'aal' is distinct from 'aal2'",
    "coalesce(auth.jwt() ->> 'aal', '') <> 'aal2'",
    "coalesce((select auth.jwt() ->> 'aal'), '') <> 'aal2'",
    "coalesce(auth.jwt()->>'aal','')='aal2'",
  ]) {
    const input = {
      schema: 'public',
      name: 'admin_test',
      signature: 'public.admin_test()',
      definition: `if ${condition} then perform permission_check(); end if;`,
    };
    const output = developmentGate(input);
    assert.ok(output?.includes("admin_development_private.assurance_v1(auth.jwt()->>'aal')"));
    assert.ok(output?.includes('perform permission_check()'));
    assert.equal(output?.includes('not admin_development_private'), !condition.endsWith("='aal2'"));
    assert.ok(!output?.includes("'aal2'"));
    assert.equal(developmentGate({ ...input, schema: 'auth' }), null);
    assert.equal(developmentGate({ ...input, name: 'member_function' }), null);
  }
});

test('unknown guards, missing definitions, duplicate identities and incomplete manifests fail closed', () => {
  const input = {
    schema: 'public',
    name: 'admin_user_has_permission',
    signature: 'public.admin_user_has_permission(text)',
    definition: "select auth.jwt()->>'aal'='aal2'",
  };
  assert.throws(() =>
    developmentGate({ ...input, definition: input.definition + " or 'aal2'=unreviewed()" }),
  );
  assert.throws(() => buildAdminDevelopmentSql([]));
  assert.throws(() => buildAdminDevelopmentSql([input, input]));
  assert.throws(() => buildAdminDevelopmentSql([{ ...input, name: 'other' }]));
  assert.throws(() => buildAdminDevelopmentSql([input]), /Missing reviewed route/);
});

test('assembly preserves literal SQL dollar characters and pins the reviewed gate', () => {
  const contracts = {
    ...employeeRouteContracts,
    ...employeeHistoryContracts,
    admin_announcement_compose_v1: employeeAnnouncementContract,
    admin_user_has_permission: { types: ['text'] },
  };
  const definitions = Object.entries(contracts).map(([name, contract]) => {
    const schema = ['get_admin_employee_directory_v1', 'admin_set_employee_role_v1'].includes(name)
      ? 'portal_identity_private'
      : 'public';
    const actual =
      name === 'get_admin_employee_directory_v1'
        ? 'employee_directory_v1'
        : name === 'admin_set_employee_role_v1'
          ? 'employee_role_command_v1'
          : name;
    return {
      schema,
      name: actual,
      signature: `${schema}.${actual}(${contract.types.join(',')})`,
      definition:
        name === 'admin_user_has_permission'
          ? "select coalesce(auth.jwt()->>'aal','')='aal2' and name ~ '^[A-Za-z0-9_]+$'"
          : 'select null;',
    };
  });
  const result = buildAdminDevelopmentSql(definitions);
  assert.equal(result.split('create function admin_development_private.invoke_v1(').length, 2);
  assert.ok(result.includes("name ~ ''^[A-Za-z0-9_]+$''"));
  assert.ok(result.includes("p_token_hash!~'^[a-f0-9]{64}$'"));
  assert.match(result, /Reviewed staging definition changed/);
  assert.ok(!result.includes('-- DOJI_DEVELOPMENT_MANIFEST'));
});
