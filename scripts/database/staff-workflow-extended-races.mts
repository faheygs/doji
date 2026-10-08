import assert from 'node:assert/strict';
import type { TestRoom } from './contracts.mts';
import { staffWorkflowOverlap } from './staff-workflow-races.mts';

// This accepts only the owned clean-room container, never a connection URL.
export async function extendedWorkflowRaces(room: TestRoom, engine: string) {
  room.inspect();
  const appeal = '99000000-0000-4000-8000-000000000005';
  const privacy = '99000000-0000-4000-8000-000000000006';
  const report = '99000000-0000-4000-8000-000000000003';
  const decision = '99000000-0000-4000-8000-000000000004';
  const member = '91000000-0000-4000-8000-000000000001';
  const employee = (n: number) => `98000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const actor = (n: number) =>
    `set local request.jwt.claims='${JSON.stringify({ sub: employee(n), role: 'doji_employee', aal: 'aal2' })}';set local role doji_employee;`;
  const reset = (id: string) =>
    room.sql(`delete from staff_workflow_private.receipts where outcome->>'id'='${id}';
    delete from staff_workflow_private.history where case_id='${id}';delete from staff_workflow_private.ownership where case_id='${id}';`);
  room.sql(`begin;set local search_path=public,extensions;
    update staff_workflow_private.settings set extended_enabled=true;
    update business_private.privacy_settings set enabled=true;
    insert into public.reports(id,reported_user_id,reporter_id,reason,target_kind) values('${report}','${member}','${member}','spam_scam','account');
    insert into public.moderation_decisions(id,report_id,affected_user_id,content_kind,action,policy_code,severity,rationale,user_notice,decided_by)
    values('${decision}','${report}','${member}','account','no_violation','no_violation','none','Synthetic race rationale','Synthetic race notice','${employee(3)}');
    insert into public.moderation_appeals(id,decision_id,user_id,statement) values('${appeal}','${decision}','${member}','Synthetic independent review race');
    insert into business_private.privacy_cases(id,account_id,kind,verification_reference,due_at)
    values('${privacy}','96000000-0000-4000-8000-000000000001','access','synthetic-race',now()+interval '30 days');commit;`);
  try {
    for (const [kind, id, change] of [
      [
        'appeal',
        appeal,
        `update public.moderation_appeals set statement='Synthetic changed review statement' where id='${appeal}';`,
      ],
      [
        'business_privacy',
        privacy,
        `update business_private.privacy_cases set state='denied',revision=revision+1 where id='${privacy}';`,
      ],
    ] as const) {
      const version = room.sql(
        `begin;${actor(1)}select public.get_admin_case_ownership_v1('${kind}','${id}')->>'source_version';commit;`,
      );
      const claim = (n: number) =>
        `${actor(n)}select public.admin_case_ownership_command_v1('${kind}','${id}',0,'${version}','claim',null,gen_random_uuid());`;
      const competing = await staffWorkflowOverlap(room, engine, claim(1), claim(2));
      assert.notEqual(competing.code, 0);
      assert.match(competing.err, /Assignment changed/);
      assert.equal(
        room.sql(`select count(*) from staff_workflow_private.history where case_id='${id}';`),
        '1',
      );
      console.log(`PASS: overlapping ${kind} claims create one winner and one history entry`);
      reset(id);
      const changed = await staffWorkflowOverlap(room, engine, change, claim(1));
      assert.notEqual(changed.code, 0);
      assert.match(changed.err, /Work item changed/);
      assert.equal(
        room.sql(`select count(*) from staff_workflow_private.history where case_id='${id}';`),
        '0',
      );
      console.log(`PASS: ${kind} source update racing assignment rejects stale ownership command`);
    }
  } finally {
    reset(appeal);
    reset(privacy);
    room.sql(`begin;delete from public.moderation_appeals where id='${appeal}';
      delete from public.moderation_decisions where id='${decision}';delete from public.reports where id='${report}';
      delete from business_private.privacy_cases where id='${privacy}';
      update staff_workflow_private.settings set extended_enabled=false;
      update business_private.privacy_settings set enabled=false;commit;`);
  }
}
