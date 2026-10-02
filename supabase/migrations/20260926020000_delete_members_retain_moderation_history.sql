-- Approved member-deletion repair, independent of the employee-auth rollout.
-- Login/profile deletion must not require a clean moderation record. Retain
-- existing case records with private opaque identity references, never a live
-- member profile or a copied email/name/password. No member read/RLS changes.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create table public.admin_deleted_member_references (
  member_id uuid primary key,
  deleted_at timestamptz not null default clock_timestamp()
);
alter table public.admin_deleted_member_references enable row level security;
revoke all on public.admin_deleted_member_references from public,anon,authenticated;

-- The private history rows retain the UUIDs whose live foreign keys are cleared.
-- Existing permissions on these tables remain unchanged.
alter table public.reports add column deleted_member_refs jsonb not null default '{}';
alter table public.moderation_decisions add column deleted_member_refs jsonb not null default '{}';
alter table public.moderation_account_actions add column deleted_member_refs jsonb not null default '{}';
alter table public.moderation_notices add column deleted_member_refs jsonb not null default '{}';
alter table public.moderation_appeals add column deleted_member_refs jsonb not null default '{}';
alter table public.admin_audit_log add column deleted_member_refs jsonb not null default '{}';
alter table public.challenge_suggestions add column deleted_member_refs jsonb not null default '{}';

-- Bound identity lookup work during deletion; existing subject indexes cover
-- decisions, account actions and notices. Timeout rolls back this whole release.
create index reports_reporter_deletion_idx on public.reports(reporter_id);
create index reports_subject_deletion_idx on public.reports(reported_user_id);
create index moderation_decisions_actor_deletion_idx on public.moderation_decisions(decided_by);
create index moderation_decisions_reverser_deletion_idx on public.moderation_decisions(reversed_by);
create index moderation_appeals_subject_deletion_idx on public.moderation_appeals(user_id);
create index moderation_appeals_reviewer_deletion_idx on public.moderation_appeals(reviewed_by);
create index admin_audit_actor_deletion_idx on public.admin_audit_log(actor_id);
create index challenge_suggestions_reviewer_deletion_idx on public.challenge_suggestions(reviewed_by);

-- Reports made by a departing member must survive as cases, especially when a
-- decision already refers to them. Other report/content FKs already SET NULL.
alter table public.reports alter column reporter_id drop not null,
  drop constraint reports_reporter_fkey,
  add constraint reports_reporter_fkey foreign key(reporter_id) references public.profiles(id) on delete set null;

do $$
declare ref record;
begin
  for ref in select * from (values
    ('moderation_decisions','affected_user_id'),
    ('moderation_decisions','decided_by'),
    ('moderation_decisions','reversed_by'),
    ('moderation_account_actions','user_id'),
    ('moderation_notices','user_id'),
    ('moderation_appeals','user_id'),
    ('moderation_appeals','reviewed_by'),
    ('challenge_suggestions','reviewed_by')
  ) refs(table_name,column_name) loop
    execute format('alter table public.%I alter column %I drop not null, drop constraint %I, add constraint %I foreign key(%I) references public.profiles(id) on delete set null',
      ref.table_name,ref.column_name,ref.table_name||'_'||ref.column_name||'_fkey',
      ref.table_name||'_'||ref.column_name||'_fkey',ref.column_name);
  end loop;
end;
$$;
alter table public.moderation_appeals drop constraint moderation_appeals_status_check,
  add constraint moderation_appeals_status_check check(status in ('pending','upheld','reversed','closed_account_deleted'));

create function public.retain_moderation_history_on_member_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare ref record; affected integer; appeals_closed integer; retained boolean := false;
begin
  for ref in select * from (values
    ('reports','reporter_id'),('reports','reported_user_id'),
    ('moderation_decisions','affected_user_id'),('moderation_decisions','decided_by'),('moderation_decisions','reversed_by'),
    ('moderation_account_actions','user_id'),('moderation_notices','user_id'),
    ('moderation_appeals','user_id'),('moderation_appeals','reviewed_by'),('admin_audit_log','actor_id'),
    ('challenge_suggestions','reviewed_by')
  ) refs(table_name,column_name) loop
    execute format('update public.%I set deleted_member_refs=deleted_member_refs || jsonb_build_object(%L,$1::text) where %I=$1',
      ref.table_name,ref.column_name,ref.column_name) using old.id;
    get diagnostics affected = row_count;
    retained := retained or affected > 0;
  end loop;
  if retained then
    insert into public.admin_deleted_member_references(member_id) values(old.id) on conflict do nothing;
    -- This is a closure, never a finding or a reversal. Resolved appeals retain
    -- their original outcome, reviewer, timestamps and rationale.
    update public.moderation_appeals set status='closed_account_deleted'
      where user_id=old.id and status='pending';
    get diagnostics appeals_closed = row_count;
    insert into public.admin_audit_log(actor_id,actor_role,action,entity_type,entity_id,reason,metadata)
      values(null,'system','account.deleted','account',old.id::text,
        'Member account deleted; existing moderation history retained separately.',
        jsonb_build_object('memberId',old.id,'pendingAppealsClosed',appeals_closed));
    perform public.enqueue_domain_event('moderation:global','moderation.account.deleted',old.id,
      jsonb_build_object('version',1,'memberId',old.id),null);
  end if;
  return old;
end;
$$;
revoke all on function public.retain_moderation_history_on_member_delete() from public,anon,authenticated;
create trigger retain_moderation_history_on_member_delete before delete on public.profiles
  for each row execute function public.retain_moderation_history_on_member_delete();

-- Keep the existing authorized/audited case read and augment only its deleted
-- subject presentation. No broader evidence access or member fields are added.
alter function public.get_admin_report_case_v2(uuid) rename to get_admin_report_case_v2_before_member_deletion_20260926;
revoke all on function public.get_admin_report_case_v2_before_member_deletion_20260926(uuid) from public,anon,authenticated;
create function public.get_admin_report_case_v2(p_report_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; refs jsonb;
begin
  result := public.get_admin_report_case_v2_before_member_deletion_20260926(p_report_id);
  select deleted_member_refs into refs from public.reports where id=p_report_id;
  return result || jsonb_build_object('deleted_member_refs',coalesce(refs,'{}'::jsonb));
end;
$$;
revoke all on function public.get_admin_report_case_v2(uuid) from public,anon;
grant execute on function public.get_admin_report_case_v2(uuid) to authenticated;
commit;
