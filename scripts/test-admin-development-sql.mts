import test from 'node:test';
import assert from 'node:assert/strict';
import {
  developmentGate,
  buildAdminDevelopmentSql,
  buildAdminDevelopmentWorkflowSql,
  buildAdminDevelopmentResourceSql,
} from './build-admin-development-sql.mts';
import { employeeRouteContracts } from '../infra/portal-identity/employee-route-contracts.mts';
import { employeeHistoryContracts } from '../infra/portal-identity/employee-history-contracts.mts';
import { employeeAnnouncementContract } from '../infra/portal-identity/employee-announcement-contracts.mts';
import { employeeWorkflowContracts } from '../infra/portal-identity/employee-workflow-contracts.mts';

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

test('resource upgrade pins all existing permission helpers and has retaining drift-checked rollback', () => {
  const definitions = [
    'employee_can_read_report_evidence_v1',
    'employee_can_read_avatar_evidence_v1',
    'employee_can_read_preserved_media_v1',
    'get_admin_staff_event_channels_v1',
  ].map((name) => ({
    schema: 'public',
    name,
    signature: `public.${name}(${name.startsWith('employee') ? 'text' : ''})`,
    definition: 'select null;',
  }));
  assert.throws(() => buildAdminDevelopmentResourceSql([]));
  assert.throws(() => buildAdminDevelopmentResourceSql([...definitions, definitions[0]!]));
  const patch = buildAdminDevelopmentResourceSql(definitions);
  assert.match(patch.apply, /assurance_v1/);
  assert.match(patch.apply, /revoke all/);
  assert.doesNotMatch(patch.apply, /grant execute|create or replace/i);
  assert.match(patch.rollback, /Resource adapter definition drifted/);
  assert.doesNotMatch(patch.rollback, /delete from (public|admin_development_private.audit)/);
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
    ...employeeWorkflowContracts,
    admin_announcement_compose_v1: employeeAnnouncementContract,
    admin_user_has_permission: { types: ['text'] },
  };
  const definitions = Object.entries(contracts).map(([name, contract]) => {
    const schema = ['get_admin_employee_directory_v1', 'admin_set_employee_role_v1'].includes(name)
      ? 'portal_identity_private'
      : name === 'get_admin_case_assignees_v1'
        ? 'staff_workflow_private'
        : 'public';
    const actual =
      name === 'get_admin_employee_directory_v1'
        ? 'employee_directory_v1'
        : name === 'admin_set_employee_role_v1'
          ? 'employee_role_command_v1'
          : name === 'get_admin_case_assignees_v1'
            ? 'assignees'
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
  for (const name of Object.keys(employeeWorkflowContracts)) {
    if (name === 'get_admin_staff_event_channels_v1') continue;
    assert.ok(result.includes(`('${name}',`), `Missing local workflow route: ${name}`);
  }
  assert.ok(!result.includes("('get_admin_staff_event_channels_v1',"));
  const upgrade = buildAdminDevelopmentWorkflowSql(definitions);
  assert.match(upgrade.apply, /insert into admin_development_private\.routes/);
  assert.match(upgrade.rollback, /Development workflow route drifted/);
  assert.doesNotMatch(upgrade.apply, /create|update|delete|alter|grant|revoke/i);
  assert.doesNotMatch(upgrade.apply, /get_admin_staff_event_channels_v1/);
  assert.throws(() => buildAdminDevelopmentWorkflowSql([]), /reviewed workflow definition/);
  assert.throws(() => buildAdminDevelopmentWorkflowSql([...definitions, ...definitions]));
});
