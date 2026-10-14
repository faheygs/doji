-- LOCAL PREPARATION ONLY. Shared Storage policy change requires separate release review.
-- Apply in one transaction BEFORE the case-read draft. Never change bucket publicity
-- or member policies. A production index build needs its own lock/capacity plan.
do $$begin
  if not exists(select 1 from pg_catalog.pg_policies
    where schemaname='storage' and tablename='objects' and policyname='employee_report_evidence_boundary'
      and cmd='SELECT' and permissive='RESTRICTIVE' and roles=array['doji_employee']::name[]
      and qual='((bucket_id = ''post-media''::text) AND employee_can_read_report_evidence_v1(name))') then
    raise exception 'Employee Storage boundary changed; inspect before applying avatar draft';
  end if;
end$$;
create index employee_avatar_decision_reference_idx
  on public.moderation_decisions
    (public.public_storage_object_path(original_payload->>'avatar_url','avatars'))
  where content_kind='profile_photo';

create function public.employee_can_read_avatar_evidence_v1(p_object_path text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare subject_id uuid; restricted boolean; matched boolean; can_restricted boolean;
begin
  if auth.jwt()->>'role' is distinct from 'doji_employee'
     or auth.jwt()->>'aal' is distinct from 'aal2'
     or not public.admin_user_has_permission('moderation.read') then return false; end if;
  -- Only canonical actor-owned avatar paths. Never authorize URLs, traversal,
  -- encoded separators, or arbitrary objects from the public avatar bucket.
  if p_object_path is null or length(p_object_path)>1024
     or p_object_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^?#%\\]+$'
     or p_object_path ~ '(^|/)(\.|\.\.)?(/|$)' then return false; end if;
  subject_id := split_part(p_object_path,'/',1)::uuid;
  can_restricted := public.admin_user_has_permission('legal.read');
  -- Current profile/report lookup uses their existing PK/subject index. Preserved
  -- references use the new partial expression index, not a history-wide JSON scan.
  -- Any restricted association for these exact bytes wins over a routine duplicate.
  select count(*)>0,coalesce(bool_or(candidate.restricted),false) into matched,restricted
  from (
    select coalesce(triage.queue,'moderation')<>'moderation' as restricted
    from public.profiles profile
    join public.reports report on report.reported_user_id=profile.id
    left join public.admin_report_triage triage on triage.report_id=report.id
    where profile.id=subject_id and report.target_kind='profile_photo'
      and report.status in ('pending','dismissed','actioned')
      and public.public_storage_object_path(profile.avatar_url,'avatars')=p_object_path
    union all
    select coalesce(triage.queue,'moderation')<>'moderation'
      or coalesce(consequence.action in ('temporary_restriction','permanent_ban'),false)
    from public.moderation_decisions decision
    join public.moderation_appeals appeal on appeal.decision_id=decision.id
    join public.reports report on report.id=decision.report_id
    left join public.admin_report_triage triage on triage.report_id=report.id
    left join public.moderation_account_actions consequence on consequence.decision_id=decision.id
    where decision.content_kind='profile_photo' and decision.content_id=subject_id
      and public.public_storage_object_path(decision.original_payload->>'avatar_url','avatars')=p_object_path
      and report.status in ('pending','dismissed','actioned')
  ) candidate;
  return matched and (not restricted or can_restricted);
end;
$$;
revoke all on function public.employee_can_read_avatar_evidence_v1(text)
  from public,anon,authenticated,service_role,doji_employee;
grant execute on function public.employee_can_read_avatar_evidence_v1(text) to doji_employee;

create policy employee_avatar_evidence_read on storage.objects for select to doji_employee
  using (bucket_id='avatars' and public.employee_can_read_avatar_evidence_v1(name));
-- Preserve the post-media branch byte-for-byte in intent. PUBLIC permissive
-- policies cannot widen employee access; existing member policies are untouched.
alter policy employee_report_evidence_boundary on storage.objects
  using ((bucket_id='post-media' and public.employee_can_read_report_evidence_v1(name))
    or (bucket_id='avatars' and public.employee_can_read_avatar_evidence_v1(name)));

comment on function public.employee_can_read_avatar_evidence_v1(text) is
  'AAL2 employee-only exact current report/preserved appeal avatar authorization. Restricted associations take precedence. Does not grant uploads, edits, deletes or bucket-wide access.';
