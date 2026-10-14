-- LOCAL ONLY. Durable identifier invalidation; no subscriber/provider enabled.
-- Both extended_enabled and events_enabled are false at installation.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create function public.get_admin_staff_event_channels_v1() returns jsonb
language plpgsql security definer set search_path='' as $$declare channels text[]:=array[]::text[];begin
 perform staff_workflow_private.extended_actor();
 if not exists(select 1 from staff_workflow_private.settings where events_enabled) then return '[]'::jsonb;end if;
 if public.admin_user_has_permission('moderation.read') then
  channels:=channels||array['staff:workflow:moderation'];
  if public.admin_user_has_permission('legal.read') then channels:=channels||array['staff:workflow:restricted'];end if;
 end if;
 if public.admin_user_has_permission('operations.read') then channels:=channels||array['staff:workflow:ideas'];end if;
 if public.admin_user_has_permission('business.read') then channels:=channels||array['staff:workflow:business'];end if;
 if public.admin_user_has_permission('admin.manage') and public.admin_user_has_permission('legal.read') then
  channels:=channels||array['staff:workflow:privacy'];end if;
 return to_jsonb(channels);
end$$;

create function staff_workflow_private.event_bucket(p_kind text,p_row jsonb) returns text
language plpgsql stable security definer set search_path='' as $$declare restricted boolean;begin
 if p_kind='suggestion' then return 'ideas';end if;
 if p_kind='business_application' then return 'business';end if;
 if p_kind='business_privacy' then return 'privacy';end if;
 if p_kind='external_intake' then restricted:=p_row->>'queue'='restricted_safety';
 elsif p_kind='report' then
  restricted:=case when p_row ? 'queue' then p_row->>'queue'='restricted_safety'
   else exists(select 1 from public.admin_report_triage where report_id=(p_row->>'id')::uuid and queue='restricted_safety') end;
 elsif p_kind='appeal' then
  restricted:=case when p_row ? 'decision_id' then exists(select 1 from public.moderation_account_actions
   where decision_id=(p_row->>'decision_id')::uuid and action in ('temporary_restriction','permanent_ban'))
   else staff_workflow_private.appeal_restricted((p_row->>'id')::uuid) end;
 else raise exception using errcode='22023',message='Unknown staff event source';end if;
 return case when coalesce(restricted,false) then 'restricted' else 'moderation' end;
end$$;

create function staff_workflow_private.invalidate() returns trigger
language plpgsql security definer set search_path='' as $$
declare prior jsonb; fresh jsonb; kind text:=tg_argv[0]; id uuid; bucket text; old_bucket text; key text;begin
 -- Disabled trigger only reads the singleton gate. No event/outbox write.
 if not exists(select 1 from staff_workflow_private.settings where enabled and extended_enabled and events_enabled) then return null;end if;
 -- Coordinate retaining rollback with transactions that have passed the gate.
 perform 1 from staff_workflow_private.settings where enabled and extended_enabled and events_enabled for share;
 if not found then return null;end if;
 if tg_op<>'INSERT' then prior:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then fresh:=to_jsonb(new);end if;
 if tg_op='UPDATE' and prior=fresh then return null;end if;
 if kind='ownership' then
  kind:=coalesce(fresh,prior)->>'kind';id:=(coalesce(fresh,prior)->>'case_id')::uuid;
  fresh:=jsonb_build_object('id',id);prior:=fresh;
 elsif kind='triage' then
  kind:='report';id:=(coalesce(fresh,prior)->>'report_id')::uuid;
  fresh:=fresh||jsonb_build_object('id',id);prior:=prior||jsonb_build_object('id',id);
 else id:=(coalesce(fresh,prior)->>'id')::uuid;
 end if;
 -- Never wake reviewers for a never-submitted business draft.
 if kind='business_application' and tg_argv[0]<>'ownership' and
  coalesce(prior->>'state','draft')='draft' and coalesce(fresh->>'state','draft')='draft' then return null;end if;
 -- After deletion dependent authorization rows may have cascaded away. Do
 -- not infer the old restriction level; invalidate queues without the case ID.
 if tg_op='DELETE' and tg_argv[0] in ('report','appeal') then
  foreach bucket in array array['moderation','restricted'] loop
   perform public.enqueue_domain_event('staff:workflow:'||bucket,'staff.queue.changed',null,
    jsonb_build_object('kind',kind),'staff-delete:'||pg_current_xact_id()::text||':'||kind||':'||id||':'||bucket);
  end loop;
  return null;
 end if;
 bucket:=staff_workflow_private.event_bucket(kind,coalesce(fresh,prior));
 old_bucket:=staff_workflow_private.event_bucket(kind,coalesce(prior,fresh));
 -- A moved case disappears from the former audience. Wake that queue without
 -- disclosing the identifier under its new restriction classification.
 if old_bucket<>bucket then
  perform public.enqueue_domain_event('staff:workflow:'||old_bucket,'staff.queue.changed',null,
   jsonb_build_object('kind',kind),'staff-move:'||pg_current_xact_id()::text||':'||kind||':'||id||':'||old_bucket);
 end if;
 -- Coalesce the same case/bucket within one transaction. Retrying a receipt
 -- makes no ownership write, hence creates no new event. No user content/state.
 foreach bucket in array array[bucket] loop
  key:='staff-workflow:'||pg_current_xact_id()::text||':'||kind||':'||id||':'||bucket;
  perform public.enqueue_domain_event('staff:workflow:'||bucket,'staff.case.changed',id,
   jsonb_build_object('kind',kind,'id',id),key);
 end loop;
 return null;
end$$;

-- Appeal eligibility and restriction also depend on the original decision and
-- account action. No case enumeration or private identifiers go to either queue.
create function staff_workflow_private.invalidate_appeal_dependency() returns trigger
language plpgsql security definer set search_path='' as $$
declare prior jsonb; fresh jsonb; decision uuid; bucket text;begin
 if not exists(select 1 from staff_workflow_private.settings where enabled and extended_enabled and events_enabled) then return null;end if;
 perform 1 from staff_workflow_private.settings where enabled and extended_enabled and events_enabled for share;
 if not found then return null;end if;
 if tg_op<>'INSERT' then prior:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then fresh:=to_jsonb(new);end if;
 if tg_op='UPDATE' and prior=fresh then return null;end if;
 for decision in select distinct (x->>tg_argv[0])::uuid from unnest(array[prior,fresh]) x where x is not null loop
  if exists(select 1 from public.moderation_appeals where decision_id=decision and status='pending') then
   foreach bucket in array array['moderation','restricted'] loop
    perform public.enqueue_domain_event('staff:workflow:'||bucket,'staff.queue.changed',null,
     jsonb_build_object('kind','appeal'),'staff-appeal-dependency:'||pg_current_xact_id()::text||':'||decision||':'||bucket);
   end loop;
  end if;
 end loop;
 return null;
end$$;

create trigger staff_workflow_ownership_event after insert or update or delete on staff_workflow_private.ownership
 for each row execute function staff_workflow_private.invalidate('ownership');
create trigger staff_workflow_report_event after insert or update or delete on public.reports
 for each row execute function staff_workflow_private.invalidate('report');
create trigger staff_workflow_triage_event after insert or update or delete on public.admin_report_triage
 for each row execute function staff_workflow_private.invalidate('triage');
create trigger staff_workflow_appeal_event after insert or update or delete on public.moderation_appeals
 for each row execute function staff_workflow_private.invalidate('appeal');
create trigger staff_workflow_appeal_decision_event after update or delete on public.moderation_decisions
 for each row execute function staff_workflow_private.invalidate_appeal_dependency('id');
create trigger staff_workflow_appeal_action_event after insert or update or delete on public.moderation_account_actions
 for each row execute function staff_workflow_private.invalidate_appeal_dependency('decision_id');
create trigger staff_workflow_idea_event after insert or update or delete on public.challenge_suggestions
 for each row execute function staff_workflow_private.invalidate('suggestion');
create trigger staff_workflow_business_event after insert or update or delete on business_private.applications
 for each row execute function staff_workflow_private.invalidate('business_application');
create trigger staff_workflow_privacy_event after insert or update or delete on business_private.privacy_cases
 for each row execute function staff_workflow_private.invalidate('business_privacy');
create trigger staff_workflow_intake_event after insert or update or delete on public.safety_removal_cases
 for each row execute function staff_workflow_private.invalidate('external_intake');
revoke all on all functions in schema staff_workflow_private from public,anon,authenticated,doji_employee,doji_business,service_role;
revoke all on function public.get_admin_staff_event_channels_v1() from public,anon,authenticated,service_role,doji_business,doji_employee_application;
grant execute on function public.get_admin_staff_event_channels_v1() to doji_employee;
commit;
