// Generate a reviewable draft from the exact released contracts; never deploys.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const read = (p: string) => readFileSync(p, 'utf8').replaceAll('\r\n', '\n');
const replace = (s: string, before: string, after: string) => {
  assert.equal(s.split(before).length, 2, `Expected exactly one anchor: ${before}`);
  return s.replace(before, after);
};
const base = read('supabase/migrations/20260927040000_announcement_campaigns.sql');
const originalCommand = base.slice(
  base.indexOf('create or replace function public.admin_editorial_command_v1'),
  base.indexOf('create or replace function public.submit_challenge_suggestion'),
);
let command = originalCommand;
command = replace(
  command,
  "if p_action not in ('approved','rejected')",
  "if p_action not in ('approved','rejected','pending')",
);
command = replace(
  command,
  "    if s.status<>'pending' or s.user_id is null then raise exception 'This idea cannot be reviewed'; end if;\n    if p_action='approved' then",
  `    if s.user_id is null then raise exception 'The submitting account is no longer available'; end if;
    if s.status=p_action then raise exception 'This idea already has that status'; end if;
    -- Same lock as the unchanged production scheduler. Fail fast rather than
    -- queueing an administrative command in front of scheduling work.
    if not pg_try_advisory_xact_lock(hashtextextended('doji:prepare-next',0)) then
      raise exception 'Doji scheduling is in progress. Reload and try again.';
    end if;
    select r.challenge_id into challenge_id from public.admin_suggestion_reviews r where r.suggestion_id=p_id;
    if challenge_id is null and (s.status='approved' or s.selected_at is not null) then
      raise exception 'The original challenge link is unavailable. This historical decision needs manual investigation.';
    end if;
    if challenge_id is not null then
      perform 1 from public.challenges c where c.id=command.challenge_id for update nowait;
      if not found then raise exception 'The linked challenge is unavailable. Review its history before changing this decision.'; end if;
      if exists(select 1 from public.daily_events e where e.challenge_id=command.challenge_id and e.closed_at is null) then
        raise exception 'This challenge has a scheduled or unclosed Doji. Its decision cannot change until that event is closed.';
      end if;
      if p_action<>'approved' and not exists(select 1 from public.challenges c where c.is_active and c.id<>command.challenge_id) then
        raise exception 'Keep at least one eligible challenge in the pool before withdrawing this idea.';
      end if;
      update public.challenges c set is_active=(p_action='approved') where c.id=command.challenge_id;
    end if;
    if p_action='approved' and challenge_id is null then`,
);
command = replace(
  command,
  "selected_at=case when p_action='approved' then clock_timestamp() else selected_at end",
  "selected_at=case when p_action='approved' then coalesce(selected_at,clock_timestamp()) else selected_at end",
);
command = replace(
  command,
  '    insert into public.admin_suggestion_reviews(suggestion_id,actor_id,decision,challenge_id) values(p_id,uid,p_action,challenge_id);',
  `    insert into public.admin_suggestion_reviews(suggestion_id,actor_id,decision,challenge_id)
      values(p_id,uid,p_action,challenge_id)
      on conflict (suggestion_id) do update set actor_id=excluded.actor_id,
        decision=excluded.decision,challenge_id=excluded.challenge_id,created_at=clock_timestamp();
    -- Existing review push rules remain unchanged (at most one per outcome).
    -- Every revision, including reopening, must invalidate the owner's current
    -- status/bell even when that outcome's old push was already delivered.
    perform public.enqueue_domain_event('user:'||s.user_id::text||':events',
      'notification.suggestion.updated',p_id,
      jsonb_build_object('version',1,'suggestionId',p_id,'sendPush',false),null);`,
);
command = replace(
  command,
  "jsonb_build_object('contract','editorial.v1','challenge_id',challenge_id)||",
  "jsonb_build_object('contract','editorial.v1','challenge_id',challenge_id,'previous_status',s.status,'next_status',case when p_kind='suggestions' then p_action end)||",
);
const original = read('supabase/migrations/20260927030000_employee_editorial_workflows.sql');
const originalItem = original.slice(
  original.indexOf('create function public.admin_editorial_item_v1'),
  original.indexOf('create function public.get_admin_editorial_item_v1'),
);
let item = originalItem.replace('create function', 'create or replace function');
item = replace(
  item,
  "'created_at',s.created_at,'reviewed_at',s.reviewed_at,'admin_note',s.admin_note,",
  "'created_at',s.created_at,'reviewed_at',s.reviewed_at,'selected_at',s.selected_at,'admin_note',s.admin_note,'username',p.username,",
);
item = replace(
  item,
  "'reviewer_id',r.actor_id,'author'",
  "'reviewer_id',r.actor_id,'reviewer',coalesce(e.display_name,'Previous reviewer'),'author'",
);
item = replace(
  item,
  'left join public.admin_suggestion_reviews r on r.suggestion_id=s.id where s.id=p_id;',
  `left join public.admin_suggestion_reviews r on r.suggestion_id=s.id
    left join public.admin_employees e on e.id=r.actor_id where s.id=p_id;
    v:=v||public.admin_idea_review_state_v1(p_id);`,
);
const helper = `create function public.admin_idea_review_state_v1(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.challenge_suggestions%rowtype; linked uuid; active boolean; blocked text; event_id uuid; event_at timestamptz;
begin
 select * into s from public.challenge_suggestions where id=p_id;
 if not found then return '{}'::jsonb; end if;
 select r.challenge_id into linked from public.admin_suggestion_reviews r where r.suggestion_id=p_id;
 if s.user_id is null then blocked:='The submitting account is no longer available.';
 elsif linked is null and (s.status='approved' or s.selected_at is not null) then
   blocked:='The original challenge link is unavailable. This historical decision needs manual investigation.';
 elsif linked is not null then
   select c.is_active into active from public.challenges c where c.id=linked;
   if not found then blocked:='The linked challenge is unavailable. Review its history before changing this decision.';
   else
     select e.id,e.fires_at into event_id,event_at from public.daily_events e
       where e.challenge_id=linked and e.closed_at is null order by e.fires_at limit 1;
     if found then blocked:='This challenge has a scheduled or unclosed Doji. Its decision cannot change until that event is closed.';
     elsif active and not exists(select 1 from public.challenges c where c.is_active and c.id<>linked) then
       blocked:='Keep at least one eligible challenge in the pool before withdrawing this idea.';
     end if;
   end if;
 end if;
 return jsonb_build_object('review_blocked_reason',blocked,'pool_active',active,
   'scheduled_event_id',event_id,'scheduled_at',event_at,
   'allowed_actions',case when blocked is not null then '[]'::jsonb
     when s.status='pending' then '["approved","rejected"]'::jsonb
     when s.status='approved' then '["rejected","pending"]'::jsonb
     when s.status='rejected' then '["approved","pending"]'::jsonb else '[]'::jsonb end);
end $$;
revoke all on function public.admin_idea_review_state_v1(uuid) from public,anon,authenticated,doji_employee,service_role;
`;
const header = `-- Approved community idea retriage. PREPARED ONLY; release is separately verified.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
alter table public.admin_suggestion_reviews drop constraint admin_suggestion_reviews_decision_check;
alter table public.admin_suggestion_reviews add constraint admin_suggestion_reviews_decision_check check(decision in ('pending','approved','rejected'));
-- Bounded exact-challenge checks, including an overdue unclosed occurrence.
create index editorial_idea_open_event_idx on public.daily_events(challenge_id,fires_at) where closed_at is null;
-- One-time metadata recovery ONLY from exact authoritative approval receipts.
-- Never infer a relationship from matching challenge text or timing.
insert into public.admin_suggestion_reviews(suggestion_id,actor_id,decision,challenge_id,created_at)
select s.id,s.reviewed_by,'approved',matched.challenge_id,s.reviewed_at
from public.challenge_suggestions s
cross join lateral (
  select (min(r.result->>'challenge_id'))::uuid as challenge_id
  from public.command_receipts r
  where r.user_id=s.reviewed_by and r.result->>'id'=s.id::text
    and r.result->>'status'='approved' and r.result->>'user_id'=s.user_id::text
    and r.result->>'body'=s.body and r.result->>'kind'=s.kind
    and r.result->'options'=s.options and (r.result->>'reviewed_at')::timestamptz=s.reviewed_at
    and r.result->>'challenge_id' is not null
  having count(distinct r.result->>'challenge_id')=1
) matched
join public.challenges c on c.id=matched.challenge_id
where s.status='approved' and s.reviewed_by is not null and s.reviewed_at is not null
  and not exists(select 1 from public.admin_suggestion_reviews a where a.suggestion_id=s.id);
`;
writeFileSync(
  'docs/drafts/community_idea_retriage_v1.sql',
  header + helper + item + command + '\ncommit;\n',
);
// Do not restore first-review-only writes after a reversal: a pending row may
// already have a retained challenge. Pause only idea writes, keep reads/history.
const rollback = replace(
  originalCommand,
  '  perform public.admin_editorial_authorize_v1(true);',
  `  perform public.admin_editorial_authorize_v1(true);
  if p_kind='suggestions' then raise exception 'Community idea decisions are temporarily paused. No action was taken.'; end if;`,
);
writeFileSync(
  'docs/drafts/community_idea_retriage_v1.rollback.sql',
  `begin;\nset local lock_timeout='2s';\nset local statement_timeout='8s';\n${rollback}\ncommit;\n`,
);
console.log('Prepared retriage SQL and fail-closed rollback; nothing deployed.');
