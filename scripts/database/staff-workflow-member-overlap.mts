import assert from 'node:assert/strict';
import type { TestRoom } from './contracts.mts';
import { staffWorkflowOverlap } from './staff-workflow-races.mts';

// Bounded lock-coexistence check, not a production load test. Fixture members
// exist only in the owned network-disabled database and are removed afterward.
export async function staffWorkflowMemberOverlap(room: TestRoom, engine: string, safety = false) {
  room.inspect();
  const target = '91000000-0000-4000-8000-000000000091';
  room.sql(`begin;set local role postgres;set local search_path=public,extensions;
    insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data)
    values('${target}','authenticated','authenticated','overlap@test.invalid',now(),
    jsonb_build_object('terms_version','2026-08-20','privacy_version','2026-08-20','terms_accepted_at',now(),'privacy_accepted_at',now()));
    insert into public.profiles(id,username,display_name) values('${target}','workflow_overlap','Synthetic overlap target');
    update staff_workflow_private.settings set extended_enabled=true,events_enabled=true;commit;`);
  try {
    const result = await staffWorkflowOverlap(
      room,
      engine,
      `set local request.jwt.claims='{"sub":"98000000-0000-4000-8000-000000000001","role":"doji_employee","aal":"aal2"}';
       set local role doji_employee;select ${safety ? "public.get_admin_safety_work_page_v1('moderation')" : 'public.get_admin_staff_work_page_v1()'};`,
      `set local statement_timeout='3s';set local lock_timeout='1s';
       set local request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';
       set local role authenticated;
       select count(*) from public.profiles where id=auth.uid();savepoint member_command;
       select public.submit_policy_report('${target}',null,null,null,'account','spam_scam','spam',
         'Synthetic local overlap report','workflow-member-overlap-001')->>'target_kind';
       rollback to member_command;`,
      'independent',
    );
    assert.equal(result.out.trim(), '1\naccount');
    assert.equal(
      room.sql(
        `select count(*) from public.command_receipts where idempotency_key='workflow-member-overlap-001';`,
      ),
      '0',
    );
    console.log(
      'PASS: member AAL1 profile read and atomic report RPC finish while employee inbox transaction stays open; member command rolled back',
    );
  } finally {
    room.sql(`begin;set local role postgres;
      update staff_workflow_private.settings set extended_enabled=false,events_enabled=false;
      delete from public.profiles where id='${target}';delete from auth.users where id='${target}';commit;`);
  }
}
