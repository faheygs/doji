-- LOCAL CANDIDATE ONLY. Requires ledger + restoration drafts. No bucket creation.
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
create index moderation_media_content_decision_idx on public.moderation_decisions(content_kind,content_id);
-- Preserve classification before FK anonymization erases a duplicate's target.
-- This retains only an access restriction, never the deleted member's identity.
create function public.retain_media_evidence_restriction_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.admin_report_triage t where t.report_id=old.id and t.queue<>'moderation')
 or exists(select 1 from public.moderation_decisions d join public.moderation_account_actions a on a.decision_id=d.id
  where d.report_id=old.id and a.action in('temporary_restriction','permanent_ban')) then
  update public.moderation_media_objects m set restricted_evidence=true where not m.restricted_evidence and exists(
   select 1 from public.moderation_media_decisions l join public.moderation_decisions d on d.id=l.decision_id
   where l.object_id=m.id and (d.report_id=old.id or (d.content_kind='post' and d.content_id=old.post_id)
    or (d.content_kind='profile_photo' and old.target_kind='profile_photo' and d.content_id=old.reported_user_id)));
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end$$;
revoke all on function public.retain_media_evidence_restriction_v1() from public,anon,authenticated,service_role,doji_employee;
create trigger retain_media_evidence_restriction before delete or update of post_id,reported_user_id on public.reports
 for each row execute function public.retain_media_evidence_restriction_v1();
create function public.employee_can_read_preserved_media_v1(p_path text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare item public.moderation_media_objects%rowtype; restricted boolean;
begin
 if auth.jwt()->>'role' is distinct from 'doji_employee' or auth.jwt()->>'aal' is distinct from 'aal2'
  or not public.admin_user_has_permission('moderation.read') then return false; end if;
 if p_path is null or p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/original$' then return false; end if;
 if not exists(select 1 from storage.buckets where id='moderation-evidence' and public=false) then return false; end if;
 select * into item from public.moderation_media_objects where id=split_part(p_path,'/',1)::uuid;
 if not found or item.archive_proof is null or coalesce(item.archive_proof->>'sha256','') !~ '^[a-f0-9]{64}$' then return false; end if;
 -- Exact verified archive identity, never arbitrary files in the evidence bucket.
 if not exists(select 1 from storage.objects o where o.bucket_id='moderation-evidence' and o.name=p_path
  and o.id::text=item.archive_proof#>>'{evidenceIdentity,id}'
  and o.version=item.archive_proof#>>'{evidenceIdentity,version}'
  and o.metadata->>'size'=item.archive_proof#>>'{evidenceIdentity,size}'
  and o.metadata->>'mimetype'=item.archive_proof#>>'{evidenceIdentity,mime}'
  and o.metadata->>'size'=item.archive_proof->>'size') then return false; end if;
 if not exists(select 1 from public.moderation_media_decisions l
  join public.moderation_decisions d on d.id=l.decision_id
  join public.reports r on r.id=d.report_id where l.object_id=item.id) then return false; end if;
 -- Any restricted association wins, not merely whichever report the caller opens.
 -- Avatar duplicates conservatively cover all photo reports for that same member:
 -- older reports did not capture an immutable per-photo version.
 select exists(select 1 from public.moderation_media_decisions l
  join public.moderation_decisions d on d.id=l.decision_id
  join public.reports r on r.id=d.report_id or
   (d.content_kind='post' and r.target_kind='post' and r.post_id=d.content_id) or
   (d.content_kind='profile_photo' and r.target_kind='profile_photo' and r.reported_user_id=d.content_id)
  left join public.admin_report_triage t on t.report_id=r.id
  where l.object_id=item.id and (coalesce(t.queue,'moderation')<>'moderation'
   or exists(select 1 from public.moderation_decisions other
    join public.moderation_account_actions a on a.decision_id=other.id
    where other.report_id=r.id and a.action in('temporary_restriction','permanent_ban')))) into restricted;
 return not (restricted or item.restricted_evidence) or public.admin_user_has_permission('legal.read');
end$$;
revoke all on function public.employee_can_read_preserved_media_v1(text) from public,anon,authenticated,service_role,doji_employee;
grant execute on function public.employee_can_read_preserved_media_v1(text) to doji_employee;

-- Fail before changing a boundary that no longer matches the reviewed baseline.
do $$begin
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
  and policyname='employee_report_evidence_boundary' and cmd='SELECT' and permissive='RESTRICTIVE'
  and roles=array['doji_employee']::name[]
  and qual='(((bucket_id = ''post-media''::text) AND employee_can_read_report_evidence_v1(name)) OR ((bucket_id = ''avatars''::text) AND employee_can_read_avatar_evidence_v1(name)))') then
  raise exception 'Employee evidence boundary changed'; end if;
end$$;
alter policy employee_report_evidence_boundary on storage.objects using
 ((bucket_id='post-media' and public.employee_can_read_report_evidence_v1(name))
 or (bucket_id='avatars' and public.employee_can_read_avatar_evidence_v1(name))
 or (bucket_id='moderation-evidence' and public.employee_can_read_preserved_media_v1(name)));
create policy employee_preserved_media_read on storage.objects for select to doji_employee
 using(bucket_id='moderation-evidence' and public.employee_can_read_preserved_media_v1(name));
-- Restrictive policies also defeat any unrelated permissive PUBLIC policy.
create policy preserved_media_member_boundary on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'moderation-evidence') with check(bucket_id<>'moderation-evidence');
create policy preserved_media_employee_insert on storage.objects as restrictive for insert to doji_employee
 with check(bucket_id<>'moderation-evidence');
create policy preserved_media_employee_update on storage.objects as restrictive for update to doji_employee
 using(bucket_id<>'moderation-evidence') with check(bucket_id<>'moderation-evidence');
create policy preserved_media_employee_delete on storage.objects as restrictive for delete to doji_employee
 using(bucket_id<>'moderation-evidence');

-- Internal helper only. Existing audited case readers authorize the exact report;
-- Storage repeats authorization when signing. No new public RPC or Worker route.
create function public.preserved_media_manifest_v1(p_decision uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare items jsonb;
begin
 if auth.jwt()->>'role' is distinct from 'doji_employee' or auth.jwt()->>'aal' is distinct from 'aal2'
  or not public.admin_user_has_permission('moderation.read') then raise exception 'Employee evidence access required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('slot',asset.slot,'kind',case when asset.slot='video' then 'video' else 'image' end,
  'availability',case when asset.archive_proof is null then 'archive_pending'
   when not asset.authorized then 'staff_storage_not_authorized' else 'available' end,
  'phase',asset.phase,'desired',asset.desired,
  'bucket','moderation-evidence','path',case when asset.authorized then asset.id::text||'/original' else null end)
  order by asset.slot),'[]') into items from (
   select m.id,m.archive_proof,m.phase,m.desired,l.slot,public.employee_can_read_preserved_media_v1(m.id::text||'/original') authorized
   from public.moderation_media_decisions l join public.moderation_media_objects m on m.id=l.object_id
   where l.decision_id=p_decision order by l.slot limit 3) asset;
 return jsonb_build_object('source','preserved_decision_media','decision_id',p_decision,
  'historical_snapshot',true,'complete_content_snapshot',false,'items',items,
  'access_gaps',exists(select 1 from public.moderation_media_gaps where decision_id=p_decision));
end$$;
revoke all on function public.preserved_media_manifest_v1(uuid) from public,anon,authenticated,service_role,doji_employee;

create function public.publish_moderation_media_progress_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare target record;
begin
 if (new.phase,new.desired,new.failure_code) is not distinct from (old.phase,old.desired,old.failure_code) then return new; end if;
 for target in select distinct d.report_id from public.moderation_media_decisions l
  join public.moderation_decisions d on d.id=l.decision_id where l.object_id=new.id and d.report_id is not null loop
  perform public.enqueue_domain_event('moderation:global','moderation.media.updated',target.report_id,
   jsonb_build_object('version',1,'reportId',target.report_id),null);
 end loop;
 return new;
end$$;
revoke all on function public.publish_moderation_media_progress_v1() from public,anon,authenticated,doji_employee,service_role;
create trigger publish_moderation_media_progress after update of phase,desired,failure_code on public.moderation_media_objects
 for each row execute function public.publish_moderation_media_progress_v1();

do $patch$ declare f record; original text; replacement text;
begin
 for f in select * from (values
  ('public.get_admin_report_case_v3(uuid)',
   '''case_contract_version'',3,',
   '''case_contract_version'',3,''preserved_media_manifest'',public.preserved_media_manifest_v1((base#>>''{current_decision,id}'')::uuid),'),
  ('public.get_admin_appeal_case_v1(uuid)',
   '''original_evidence'',original_evidence,''report_case'',report_case,',
   '''original_evidence'',original_evidence||jsonb_build_object(''preserved_media_manifest'',public.preserved_media_manifest_v1(decision.id)),''report_case'',report_case,')
 ) patches(signature,anchor,replacement) loop
  original:=pg_get_functiondef(f.signature::regprocedure);
  if length(original)-length(replace(original,f.anchor,''))<>length(f.anchor) then raise exception 'Unexpected evidence reader definition: %',f.signature; end if;
  replacement:=replace(original,f.anchor,f.replacement);
  execute replacement;
  insert into public.moderation_media_integration_rollback values(f.signature,original,md5(pg_get_functiondef(f.signature::regprocedure)));
 end loop;
end $patch$;
commit;
