import assert from 'node:assert/strict';
import { claims, member, other, source } from './integration.mjs';

const candidate = 'docs/drafts/announcement_member_execute_v1.sql';
const rollback = 'docs/drafts/announcement_member_execute_v1.rollback.sql';
const targets = [
  'public.claim_active_app_announcement()',
  'public.record_app_announcement_action(uuid,text)',
];

// Compare every public function, not just the two targets. Canonical ACL ordering
// avoids treating PostgreSQL's GRANT serialization order as a permission change.
const snapshotSql = `select coalesce(jsonb_agg(jsonb_build_object(
  'signature', n.nspname||'.'||p.oid::regprocedure::text,
  'definition', pg_get_functiondef(p.oid), 'owner', p.proowner,
  'acl', (select jsonb_agg(to_jsonb(a) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable)
    from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)
) order by p.oid),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f';`;

export function announcementPermissions(room) {
  const checks = [];
  const pass = (label) => {
    checks.push(label);
    console.log(`PASS: ${label}`);
  };
  const snapshot = () => JSON.parse(room.sql(snapshotSql));
  const before = snapshot();
  const anon = Number(room.sql("select oid from pg_roles where rolname='anon';"));
  const affected = before.filter((row) => targets.includes(row.signature));
  assert.equal(affected.length, 2);
  for (const row of affected)
    assert.ok(row.acl.some((a) => Number(a.grantee) === anon && a.privilege_type === 'EXECUTE'));

  room.sql(source(candidate));
  const expected = before.map((row) =>
    targets.includes(row.signature)
      ? { ...row, acl: row.acl.filter((a) => Number(a.grantee) !== anon) }
      : row,
  );
  assert.deepEqual(snapshot(), expected, 'Only the two anon grants may change');
  pass(
    'Announcement candidate changes only two anonymous grants; all function bodies and other grants preserved',
  );
  room.sql(source(candidate));
  assert.deepEqual(snapshot(), expected, 'Reapplying the permission candidate is idempotent');
  pass('Announcement permission candidate is idempotent');

  room.sql(source(rollback));
  assert.deepEqual(
    snapshot(),
    before,
    'Rollback restores the exact original effective ACLs and function definitions',
  );
  pass('Announcement rollback restores original grants and definitions');
  room.sql(source(candidate));
  assert.deepEqual(snapshot(), expected);

  // All synthetic fixtures and calls below roll back. No provider can be reached
  // from the network-disabled container; no production rows are used.
  room.sql(`begin;set local statement_timeout='8s';
    insert into public.app_announcements(id,title,body,starts_at,ends_at,enabled,max_impressions_per_user)
    values('93000000-0000-4000-8000-000000000001','Synthetic permission test','Local only',
      now()-interval '1 minute',now()+interval '1 hour',true,2);
    set local request.jwt.claims='{"role":"anon"}';set local role anon;
    do $$begin
      begin perform public.claim_active_app_announcement();
        raise exception 'Anonymous claim unexpectedly succeeded';
      exception when insufficient_privilege then null;end;
      begin perform public.record_app_announcement_action('93000000-0000-4000-8000-000000000001','dismissed');
        raise exception 'Anonymous action unexpectedly succeeded';
      exception when insufficient_privilege then null;end;
      -- The intentional unauthenticated startup policy read remains callable.
      perform public.get_mobile_release_policy('android');
    end$$;
    reset role;
    do $$begin
      if exists(select 1 from public.app_announcement_receipts) then
        raise exception 'Anonymous calls created receipts';end if;
    end$$;
    ${claims(member)}
    do $$begin
      if (select count(*) from public.claim_active_app_announcement()) <> 1 then
        raise exception 'Member claim failed';end if;
      perform public.record_app_announcement_action('93000000-0000-4000-8000-000000000001','cta');
      perform public.record_app_announcement_action('93000000-0000-4000-8000-000000000001','dismissed');
      if (select count(*) from public.claim_active_app_announcement()) <> 0 then
        raise exception 'Dismissed announcement was claimed again';end if;
    end$$;
    reset role;
    create temp table saved_member_receipt as select to_jsonb(r) value from public.app_announcement_receipts r;
    ${claims(other)}
    select public.record_app_announcement_action('93000000-0000-4000-8000-000000000001','dismissed');
    reset role;
    do $$begin
      if (select count(*) from public.app_announcement_receipts) <> 1 or
        not exists(select 1 from public.app_announcement_receipts where user_id='${member}'
          and impression_count=1 and dismissed_at is not null and cta_at is not null) or
        (select value from saved_member_receipt) is distinct from
          (select to_jsonb(r) from public.app_announcement_receipts r) then
        raise exception 'Member receipt or cross-member isolation failed';end if;
    end$$;
    rollback;`);
  pass('Anonymous calls denied at execute boundary; unauthenticated release-policy read preserved');
  pass('Signed-in claim, CTA and dismissal work; other members cannot alter the receipt');
  assert.equal(
    room.sql(
      'select count(*) from public.app_announcements;select count(*) from public.app_announcement_receipts;',
    ),
    '0\n0',
  );
  pass('Announcement fixture and member receipts fully rolled back');
  return checks;
}
