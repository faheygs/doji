import { AUTHENTICATED_COMMAND_NAMES } from '../../contracts/authenticatedCommands';

test('shared command allowlist contains unique bounded SQL identifiers, not arbitrary RPC access', () => {
  expect(new Set(AUTHENTICATED_COMMAND_NAMES).size).toBe(AUTHENTICATED_COMMAND_NAMES.length);
  for (const name of AUTHENTICATED_COMMAND_NAMES) expect(name).toMatch(/^[a-z][a-z0-9_]{1,62}$/);
  expect(AUTHENTICATED_COMMAND_NAMES).toEqual(
    expect.arrayContaining([
      'submit_poll_vote',
      'complete_doji_with_post',
      'submit_challenge_suggestion',
      'purchase_shop_item',
      'equip_shop_item',
      'submit_policy_report',
    ]),
  );
  for (const forbidden of [
    'get_admin_portal_session_v3',
    'admin_business_application_command_v1',
    'create_employee',
    'execute_sql',
    '__proto__',
    'constructor',
  ]) {
    expect(AUTHENTICATED_COMMAND_NAMES).not.toContain(forbidden);
  }
});
