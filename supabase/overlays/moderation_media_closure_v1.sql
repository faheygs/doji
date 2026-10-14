-- Apply after the intake and media drafts. Does not enable public acceptance.
begin;
create function public.report_media_revocation_complete_v1(p_report uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare decision public.moderation_decisions%rowtype; target record; expected integer;
begin
 select * into decision from public.moderation_decisions where report_id=p_report and state='active'
  and action in('remove_content','remove_profile_photo') order by decided_at desc,id desc limit 1;
 if not found then return false; end if;
 if exists(select 1 from public.moderation_media_gaps where decision_id=decision.id) then return false; end if;
 if decision.content_kind='post' then
  select * into target from public.posts where id=decision.content_id;
  if not found then return false; end if;
  expected:=(target.photo_url is not null)::integer+(target.front_photo_url is not null)::integer+(target.video_url is not null)::integer;
 elsif decision.content_kind='profile_photo' then
  expected:=(decision.original_payload->>'avatar_url' is not null)::integer;
 else expected:=0; end if;
 return (select count(*)=expected and coalesce(bool_and(m.phase='revoked' and m.desired='restricted' and m.revoked_at is not null),true)
  from public.moderation_media_decisions l join public.moderation_media_objects m on m.id=l.object_id where l.decision_id=decision.id);
end$$;
revoke all on function public.report_media_revocation_complete_v1(uuid) from public,anon,authenticated,doji_employee,service_role;

create function public.guard_safety_media_closure_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state='removed' and old.state is distinct from 'removed'
  and not public.report_media_revocation_complete_v1(new.report_id) then
  raise exception 'Media access verification is incomplete. Keep this case open and review its media status.' using errcode='22023';
 end if;
 return new;
end$$;
revoke all on function public.guard_safety_media_closure_v1() from public,anon,authenticated,doji_employee,service_role;
create trigger guard_safety_media_closure before update of state on public.safety_removal_cases
 for each row execute function public.guard_safety_media_closure_v1();
commit;
