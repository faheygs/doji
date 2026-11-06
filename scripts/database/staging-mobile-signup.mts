import assert from 'node:assert/strict';
import { quote, source } from './integration.mts';

/** Runs only inside the caller's owned, network-disabled PostgreSQL fixture. */
export function verifyStagingMobileSignup(sql: (query: string) => string) {
  const priorAge = sql(`select pg_get_functiondef(oid)||coalesce(proacl::text,'')
    from pg_proc where oid='public.hook_enforce_minimum_signup_age(jsonb)'::regprocedure;`);
  const accountsBefore = sql('select count(*) from auth.users;');
  sql(source('supabase/overlays/staging_mobile_signup_v1.sql'));
  const event = (email: unknown, birth = '1999-01-01') => ({
    user: { email, user_metadata: { birth_date: birth } },
  });
  const call = (payload: unknown) =>
    JSON.parse(
      sql(`set role supabase_auth_admin;
    select public.hook_staging_mobile_signup_v1(${quote(JSON.stringify(payload))}::jsonb);`),
    );
  assert.equal(call(event('owner+doji-stage-001@gmail.com')).error.http_code, 403);
  assert.throws(() => sql('update staging_mobile_auth_private.settings set enabled=true;'));
  sql(`update staging_mobile_auth_private.settings
    set recipient_prefix='owner+doji-stage-',enabled=true;`);
  for (const email of [
    'owner+doji-stage-001@gmail.com',
    'owner+doji-stage-person-two@gmail.com',
    'OWNER+DOJI-STAGE-ANDROID-77@GMAIL.COM',
  ]) {
    assert.deepEqual(call(event(email)), {});
  }
  for (const email of [
    null,
    123,
    {},
    '',
    'owner@gmail.com',
    'other+doji-stage-001@gmail.com',
    'owner+doji-stage-@gmail.com',
    'owner+doji-stage-001@gmail.com.evil.test',
    'owner+doji-stage-001@evil.test',
    'owner+doji-stage-001@gmail.com\n',
    'owner+doji-stage-001+extra@gmail.com',
    ' owner+doji-stage-001@gmail.com',
    `owner+doji-stage-${'a'.repeat(41)}@gmail.com`,
  ]) {
    assert.equal(call(event(email)).error.http_code, 403);
  }
  for (const payload of [null, {}, { user: null }, { user: [] }]) {
    assert.equal(call(payload).error.http_code, 403);
  }
  const longPrefix = `${'a'.repeat(40)}+doji-stage-`;
  sql(`update staging_mobile_auth_private.settings set recipient_prefix=${quote(longPrefix)};`);
  assert.deepEqual(call(event(`${longPrefix}${'b'.repeat(12)}@gmail.com`)), {});
  assert.equal(call(event(`${longPrefix}${'b'.repeat(13)}@gmail.com`)).error.http_code, 403);
  sql("update staging_mobile_auth_private.settings set recipient_prefix='owner+doji-stage-';");
  for (const birth of ['', 'not-a-date', '1999-02-30', '2999-01-01', '1800-01-01']) {
    assert.equal(call(event('owner+doji-stage-001@gmail.com', birth)).error.http_code, 400);
  }
  const underage = sql(
    `select ((clock_timestamp() at time zone 'UTC')::date - interval '10 years')::date;`,
  );
  assert.equal(call(event('owner+doji-stage-001@gmail.com', underage)).error.http_code, 403);
  for (const role of ['anon', 'authenticated', 'service_role', 'doji_employee', 'doji_business']) {
    assert.equal(
      sql(`select has_function_privilege('${role}',
      'public.hook_staging_mobile_signup_v1(jsonb)','execute');`),
      'f',
    );
    assert.throws(() =>
      sql(`set role ${role}; select * from staging_mobile_auth_private.settings;`),
    );
    assert.throws(() =>
      sql(`set role ${role}; select public.hook_staging_mobile_signup_v1('{}');`),
    );
  }
  assert.throws(() =>
    sql(
      'set role supabase_auth_admin; update staging_mobile_auth_private.settings set enabled=false;',
    ),
  );
  sql(source('supabase/overlays/staging_mobile_signup_v1.rollback.sql'));
  assert.equal(call(event('owner+doji-stage-002@gmail.com')).error.http_code, 403);
  assert.equal(sql('select count(*) from auth.users;'), accountsBefore);
  assert.equal(
    sql(`select pg_get_functiondef(oid)||coalesce(proacl::text,'')
    from pg_proc where oid='public.hook_enforce_minimum_signup_age(jsonb)'::regprocedure;`),
    priorAge,
  );
  // Remove only this owned disposable fixture so the caller can verify its exact baseline.
  sql(
    'drop function public.hook_staging_mobile_signup_v1(jsonb);drop table staging_mobile_auth_private.settings;drop schema staging_mobile_auth_private;',
  );
  console.log(
    'PASS: staging signup family, age checks, default-off/rollback and role isolation; no account creation or mail',
  );
}
