// Deterministic local SQL generation from the existing authorized read contracts.
// New entry points only; never replace old reads, commands, policies or triggers.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const read = (path: string) => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const once = (source: string, before: string, after: string) => {
  assert.equal(source.split(before).length, 2, 'Unexpected baseline: ' + before);
  return source.replace(before, after);
};
let personal = read('docs/drafts/staff_workflow_extended_v1.sql').match(
  /create function public\.get_admin_staff_work_page_v1\([\s\S]*?end\$\$;/,
)?.[0];
assert.ok(personal);
personal = personal.replace('get_admin_staff_work_page_v1', 'get_admin_personal_work_page_v1');
personal = once(
  personal,
  "p_kind text default 'all',p_filter text default 'all',p_state text default 'all'",
  "p_kind text default 'all',p_state text default 'open'",
);
personal = once(
  personal,
  'perform staff_workflow_private.extended_actor();',
  'perform staff_workflow_private.extended_actor();\n perform staff_workflow_private.history_reads_actor();',
);
personal = once(
  personal,
  "  or p_filter is null or p_filter not in ('all','mine','unassigned')\n",
  '',
);
personal = once(
  personal,
  "p_state not in ('all','ready','waiting')",
  "p_state not in ('all','open','completed')",
);
personal = once(personal, 'p_limit not between 1 and 50', 'p_limit not between 1 and 25');
personal = once(
  personal,
  'or (p_after_at is null)<>(p_after_key is null)',
  'or (p_after_at is null)<>(p_after_key is null) or (p_after_at is not null and not isfinite(p_after_at))',
);
for (const owner of ['t.assigned_to', 'o.assigned_to', 'c.assigned_to']) {
  const predicate = `(p_filter='all' or (p_filter='mine' and ${owner}=auth.uid()) or (p_filter='unassigned' and ${owner} is null))`;
  assert.ok(personal.includes(predicate));
  personal = personal.replaceAll(predicate, `${owner}=auth.uid()`);
}
assert.ok(!personal.includes('p_filter'));
personal = once(
  personal,
  "'ready'::text work_state",
  "case when r.status='pending' then 'ready' else 'closed' end work_state",
);
personal = once(
  personal,
  "'Moderation appeal','ready'",
  "'Moderation appeal',case when a.status='pending' then 'ready' else 'closed' end",
);
personal = once(
  personal,
  "left(s.body,120),'ready'",
  "left(s.body,120),case when s.status='pending' then 'ready' else 'closed' end",
);
for (const [alias, column] of [
  ['r', 'status'],
  ['a', 'status'],
  ['s', 'status'],
]) {
  // The pending predicate appears in both the CASE and WHERE: scope to WHERE's conjunction.
  personal = once(
    personal,
    `and ${alias}.${column}='pending' and`,
    `and (p_state='all' or (${alias}.${column}='pending')=(p_state='open')) and`,
  );
}
personal = once(personal, "and (p_state in ('all','ready')) ", '');
assert.equal(personal.split("and p_state in ('all','ready')").length, 3);
personal = personal.replaceAll("and p_state in ('all','ready')", '');
const businessState = "case when a.state='changes_requested' then 'waiting' else 'ready' end";
personal = once(
  personal,
  `(p_state='all' or p_state=${businessState})`,
  "(p_state='all' or (a.state in ('pending','changes_requested'))=(p_state='open'))",
);
personal = once(
  personal,
  businessState,
  "case when a.state in ('approved','declined') then 'closed' when a.state='changes_requested' then 'waiting' else 'ready' end",
);
personal = once(
  personal,
  "and a.state in ('pending','changes_requested')\n",
  "and a.state in ('pending','changes_requested','approved','declined')\n",
);
const intakeState = "case when c.state='needs_information' then 'waiting' else 'ready' end";
personal = once(
  personal,
  `(p_state='all' or p_state=${intakeState})`,
  "(p_state='all' or (c.closed_at is null)=(p_state='open'))",
);
personal = once(
  personal,
  intakeState,
  "case when c.closed_at is not null then 'closed' when c.state='needs_information' then 'waiting' else 'ready' end",
);
personal = once(personal, 'and c.closed_at is null\n', '\n');
const privacyState = "case when c.state='executing' then 'waiting' else 'ready' end";
personal = once(
  personal,
  `(p_state='all' or p_state=${privacyState})`,
  "(p_state='all' or (c.state not in ('completed','denied'))=(p_state='open'))",
);
personal = once(
  personal,
  privacyState,
  "case when c.state in ('completed','denied') then 'closed' when c.state='executing' then 'waiting' else 'ready' end",
);
personal = once(personal, "and c.state not in ('completed','denied')\n", '\n');
personal = once(
  personal,
  "'scope','staff_inbox_v1'",
  "'scope','personal_work_v1','filter',p_state",
);
personal = once(
  personal,
  'jsonb_agg(to_jsonb(p) order by at,key)',
  "jsonb_agg(to_jsonb(p)||case when work_state='closed' then jsonb_build_object('due_at',null) else '{}'::jsonb end order by at,key)",
);
const header = `-- OWNER-APPROVED PREPARATION ONLY. Deployment remains gated.
-- Generated by scripts/prepare-employee-history-reads.mts. No member changes.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
alter table staff_workflow_private.settings add column history_reads_enabled boolean not null default false;
create function staff_workflow_private.history_reads_actor() returns void
language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or auth.jwt()->>'role' is distinct from 'doji_employee'
  or auth.jwt()->>'aal' is distinct from 'aal2' or not public.admin_user_has_permission('portal.session') then
  raise exception using errcode='42501',message='Employee MFA required';end if;
 if not exists(select 1 from staff_workflow_private.settings where singleton and enabled and history_reads_enabled) then
  raise exception using errcode='55000',message='Employee history reads disabled';end if;
end$$;
`;
const announcement = read('docs/drafts/employee_announcement_lifecycle_read_v1.sql.fragment');
const acl = `
revoke all on function staff_workflow_private.history_reads_actor(),
 public.get_admin_personal_work_page_v1(text,text,integer,timestamptz,text),
 public.get_admin_announcement_lifecycle_page_v1(text,integer,timestamptz,uuid)
 from public,anon,authenticated,service_role,doji_employee,doji_business,doji_employee_application;
grant execute on function public.get_admin_personal_work_page_v1(text,text,integer,timestamptz,text),
 public.get_admin_announcement_lifecycle_page_v1(text,integer,timestamptz,uuid) to doji_employee;
commit;
`;
const output = header + personal + '\n' + announcement + acl;
const path = 'docs/drafts/employee_history_reads_v1.sql';
if (process.argv[2] === '--check') assert.equal(read(path), output, 'Regenerate history read SQL');
else {
  assert.equal(process.argv.length, 2);
  writeFileSync(path, output);
}
console.log(
  'Employee history SQL ' + (process.argv[2] ? 'verified' : 'prepared') + '; not deployed.',
);
