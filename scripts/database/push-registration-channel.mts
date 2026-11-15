import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestRoom } from './contracts.mts';
import { errorOutput } from './contracts.mts';

export function pushRegistrationChannel(room: TestRoom) {
  room.inspect();
  const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const sql = (value: string) => room.sql(`set role postgres;${value}`);
  const signature =
    'public.register_native_push_endpoint_v3(text,text,text,text,text,smallint,text,text,text)';
  const definition = () => sql(`select pg_get_functiondef('${signature}'::regprocedure);`);
  const metadata = () =>
    sql(`select jsonb_build_object('owner',proowner,'acl',proacl,
    'securityDefiner',prosecdef,'config',proconfig) from pg_proc where oid='${signature}'::regprocedure;`);
  const unrelated = () =>
    sql(`select md5(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid))
    from pg_proc where prokind='f' and pronamespace='public'::regnamespace and oid<>'${signature}'::regprocedure;`);
  const before = definition(),
    grants = metadata(),
    others = unrelated();
  const fixture = source('supabase/tests/push_registration_channel.sql');
  const eas = JSON.parse(source('eas.json')) as {
    build: Record<string, { env?: Record<string, string> }>;
  };
  const channels = [
    ...new Set(
      Object.values(eas.build)
        .map((profile) => profile.env?.EXPO_PUBLIC_RELEASE_CHANNEL)
        .filter((channel): channel is string => !!channel),
    ),
  ];
  assert.ok(channels.includes('staging'));
  for (const channel of channels) assert.match(channel, /^[a-z]+$/);
  const configured = channels.map((channel) => `'${channel}'`).join(',');
  const verify = fixture.replace('/* configured channels */', configured);
  assert.throws(
    () => sql(verify),
    (error) => {
      assert.match(errorOutput(error, 'stderr'), /Invalid release channel/);
      return true;
    },
  );
  const overlay = source('supabase/overlays/push_registration_staging_channel_v1.sql');
  const rollback = source('supabase/overlays/push_registration_staging_channel_v1.rollback.sql');
  sql(overlay);
  const fixed = definition();
  assert.equal(
    fixed,
    before.replace("'preview', 'development'", "'preview', 'development', 'staging'"),
  );
  assert.equal(metadata(), grants);
  assert.match(sql(verify), /PASS: registration channels and isolation/);
  sql(overlay);
  assert.equal(definition(), fixed, 'Repeated installation is a no-op');
  // Execute the inverse in the fixture transaction after real registrations;
  // it must retain devices and their observed release identities byte-for-byte.
  const inverseBody = rollback.replace(/^begin;$/m, '').replace(/^commit;$/m, '');
  assert.match(
    sql(verify.replace('/* retaining rollback */', inverseBody)),
    /PASS: registration channels and isolation/,
  );
  assert.equal(definition(), fixed, 'Fixture transaction rolls back its inverse');
  sql(fixed.replace('declare', '-- unexpected change\ndeclare'));
  for (const action of [overlay, rollback])
    assert.throws(
      () => sql(action),
      (error) => {
        assert.match(
          errorOutput(error, 'stderr'),
          /Unexpected push registration body|Intervening push registration change/,
        );
        return true;
      },
    );
  sql(fixed);
  sql(rollback);
  sql(rollback);
  assert.equal(definition(), before);
  assert.equal(metadata(), grants);
  assert.equal(unrelated(), others);
  assert.equal(
    sql("select count(*) from auth.users where email like 'push-channel-%@test.invalid';"),
    '0',
  );
  return 'Push registration: EAS channels, both platforms, validation, auth, replay, transfer, v1/v2 compatibility and retaining rollback';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'No remote targets accepted');
  const { createCleanRoom, installManagedSchemas, replay } = await import('./clean-room.mts');
  const room = createCleanRoom();
  try {
    await room.start();
    installManagedSchemas(room);
    await replay(room);
    console.log(pushRegistrationChannel(room));
  } finally {
    room.stop();
  }
}
