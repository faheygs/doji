-- LOCAL ONLY. Additive intake; never broad-push this draft to production.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';

-- BEGIN GENERATED SAFETY TAXONOMY
create function public.safety_removal_taxonomy_v1()
returns table(reason text, detail text, reason_label text, detail_label text, restricted boolean, targets text[])
language sql immutable security definer set search_path='' as $$
 values ('bullying_harassment','bullying','Bullying or unwanted contact','Bullying or harassment',false,array['post','comment','poll_response','profile_photo','account']::text[]),
 ('bullying_harassment','unwanted_contact','Bullying or unwanted contact','Repeated unwanted contact',false,array['post','comment','poll_response','profile_photo','account']::text[]),
 ('bullying_harassment','sexual_harassment','Bullying or unwanted contact','Sexual harassment',false,array['post','comment','poll_response','profile_photo','account']::text[]),
 ('bullying_harassment','threatening_private_content','Bullying or unwanted contact','Threatening to share private content',false,array['post','comment','poll_response','profile_photo','account']::text[]),
 ('self_harm','suicide_self_harm','Suicide, self-harm or eating disorders','Suicide or self-harm',false,array['post','comment','poll_response','profile_photo','account']::text[]),
 ('self_harm','eating_disorder','Suicide, self-harm or eating disorders','Eating disorder content',false,array['post','comment','poll_response','profile_photo','account']::text[]),
 ('violence_hate_exploitation','credible_threat','Violence, hate or exploitation','A credible threat or immediate danger',true,array['post','comment','poll_response','profile_photo','account']::text[]),
 ('violence_hate_exploitation','graphic_violence','Violence, hate or exploitation','Graphic or glorified violence',false,array['post','comment','poll_response','profile_photo','account']::text[]),
 ('violence_hate_exploitation','hate_speech','Violence, hate or exploitation','Hate speech or symbols',false,array['post','comment','poll_response','profile_photo','account']::text[]),
 ('violence_hate_exploitation','human_exploitation','Violence, hate or exploitation','Human exploitation or trafficking',true,array['post','comment','poll_response','profile_photo','account']::text[]),
 ('violence_hate_exploitation','animal_abuse','Violence, hate or exploitation','Animal abuse',false,array['post','comment','poll_response','profile_photo','account']::text[]),
 ('restricted_goods','drugs','Selling or promoting restricted items','Drugs',false,array['post','comment','poll_response','account']::text[]),
 ('restricted_goods','weapons','Selling or promoting restricted items','Weapons',false,array['post','comment','poll_response','account']::text[]),
 ('restricted_goods','animals','Selling or promoting restricted items','Animals',false,array['post','comment','poll_response','account']::text[]),
 ('restricted_goods','gambling','Selling or promoting restricted items','Gambling',false,array['post','comment','poll_response','account']::text[]),
 ('restricted_goods','alcohol_tobacco','Selling or promoting restricted items','Alcohol or tobacco',false,array['post','comment','poll_response','account']::text[]),
 ('sexual_content','nonconsensual_intimate_images','Nudity or sexual activity','Threatening to share or sharing intimate images',true,array['post','comment','poll_response','profile_photo','account']::text[]),
 ('sexual_content','sexual_solicitation','Nudity or sexual activity','Sexual solicitation or prostitution',false,array['post','comment','poll_response','profile_photo','account']::text[]),
 ('sexual_content','sexual_exploitation','Nudity or sexual activity','Sexual exploitation',true,array['post','comment','poll_response','profile_photo','account']::text[]),
 ('sexual_content','child_sexual_content','Nudity or sexual activity','Sexual content involving a child',true,array['post','comment','poll_response','profile_photo','account']::text[]),
 ('sexual_content','adult_nudity_or_sexual_activity','Nudity or sexual activity','Adult nudity or sexual activity',false,array['post','comment','poll_response','profile_photo','account']::text[]),
 ('spam_scam','spam','Scam, fraud or spam','Spam',false,array['post','comment','poll_response','profile_photo','account']::text[]),
 ('spam_scam','scam_fraud','Scam, fraud or spam','Scam or fraud',false,array['post','comment','poll_response','profile_photo','account']::text[]),
 ('spam_scam','deceptive_business','Scam, fraud or spam','Deceptive business or promotion',false,array['post','comment','poll_response','profile_photo','account']::text[]),
 ('intellectual_property','copyright','Intellectual property','Copyright infringement',false,array['post','comment','poll_response','profile_photo']::text[]),
 ('intellectual_property','trademark','Intellectual property','Trademark infringement',false,array['post','comment','poll_response','profile_photo']::text[]),
 ('intellectual_property','counterfeit_goods','Intellectual property','Counterfeit goods',false,array['post','comment','poll_response','profile_photo']::text[]),
 ('privacy','personal_information','Privacy or personal information','Personal information',false,array['post','comment','poll_response','profile_photo','account']::text[]),
 ('privacy','doxxing','Privacy or personal information','Doxxing or exposing someone’s location',false,array['post','comment','poll_response','profile_photo','account']::text[]),
 ('privacy','image_used_without_permission','Privacy or personal information','An image used without permission',false,array['post','comment','poll_response','profile_photo','account']::text[]),
 ('impersonation','impersonating_me','Impersonation','They’re pretending to be me',false,array['account']::text[]),
 ('impersonation','impersonating_someone_else','Impersonation','They’re pretending to be someone else',false,array['account']::text[]),
 ('impersonation','impersonating_business','Impersonation','They’re pretending to be a business',false,array['account']::text[]),
 ('other','other','Something else','Something else',false,array['post','comment','poll_response','profile_photo','account']::text[])
$$;
revoke all on function public.safety_removal_taxonomy_v1() from public,anon,authenticated,doji_employee,service_role;
-- END GENERATED SAFETY TAXONOMY

create table public.safety_removal_cases (
 id uuid primary key,
 token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$'),
 request_hash text not null,
 received_at timestamptz not null default clock_timestamp(),
 deadline_at timestamptz not null default (clock_timestamp()+interval '48 hours'),
 request jsonb not null,
 queue text not null check(queue in ('moderation','restricted_safety')),
 priority text not null check(priority in ('normal','high','critical')),
 state text not null default 'received' check(state in ('received','reviewing','needs_information','removed','not_actionable')),
 public_message text not null default 'Your request was received and is awaiting review.',
 revision bigint not null default 1,
 updated_at timestamptz not null default clock_timestamp(),
 assigned_to uuid,
 report_id uuid references public.reports(id),
 copies_review text,
 access_review text,
 closed_at timestamptz
);
create index safety_removal_open_idx on public.safety_removal_cases(queue,received_at,id) where closed_at is null;
create index safety_removal_history_idx on public.safety_removal_cases(queue,received_at,id);
create table public.safety_removal_history (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.safety_removal_cases(id),
 occurred_at timestamptz not null default clock_timestamp(),
 actor_id uuid,
 action text not null,
 internal_note text not null default '',
 public_message text
);
create index safety_removal_case_history_idx on public.safety_removal_history(case_id,occurred_at desc,id desc);
create table public.safety_removal_receipts (
 actor_id uuid not null, command_id uuid not null, fingerprint text not null,
 result jsonb not null, primary key(actor_id,command_id)
);
-- Fixed row count: no attacker-controlled rate-limit keys or unbounded IP ledger.
create table public.safety_removal_budget (
 name text primary key, window_at timestamptz not null, used integer not null
);
create table public.safety_removal_alerts (
 case_id uuid primary key references public.safety_removal_cases(id),
 created_at timestamptz not null default clock_timestamp(),
 state text not null default 'pending' check(state in ('pending','accepted','needs_attention')),
 provider_id text, last_attempt_at timestamptz, attempts integer not null default 0
);
alter table public.safety_removal_cases enable row level security;
alter table public.safety_removal_history enable row level security;
alter table public.safety_removal_receipts enable row level security;
alter table public.safety_removal_budget enable row level security;
alter table public.safety_removal_alerts enable row level security;
revoke all on public.safety_removal_cases,public.safety_removal_history,public.safety_removal_receipts,
 public.safety_removal_budget,public.safety_removal_alerts from public,anon,authenticated,doji_employee,service_role;

create function public.safety_removal_authorize_v1(p_write boolean default false,p_case_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'doji_employee' or coalesce(auth.jwt()->>'aal','')<>'aal2' or auth.uid() is null then
  raise exception using errcode='42501',message='Restricted employee access required'; end if;
 if p_write then perform 1 from public.admin_employees where id=auth.uid() for share; end if;
 if not public.admin_user_has_permission('moderation.read')
  or (p_write and not public.admin_user_has_permission('moderation.write')) then
  raise exception using errcode='42501',message='Restricted employee access required'; end if;
 if p_case_id is not null and not exists(select 1 from public.safety_removal_cases where id=p_case_id
  and (queue='moderation' or public.admin_user_has_permission('legal.read'))) then
  raise exception using errcode='42501',message='Case unavailable'; end if;
end$$;

create function public.safety_removal_public_result_v1(p_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'received_at',received_at,'deadline_at',deadline_at,
 'state',state,'message',public_message,'updated_at',updated_at)
 from public.safety_removal_cases where id=p_id
$$;

-- Only the separately deployed Edge with validated bot protection may execute.
create function public.submit_safety_removal_v1(p_id uuid,p_token_hash text,p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.safety_removal_cases%rowtype; f text; n integer; k text; t timestamptz:=clock_timestamp(); tax record;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception using errcode='42501',message='Service access required'; end if;
 if p_id is null or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' or p_request is null or jsonb_typeof(p_request)<>'object'
  or pg_column_size(p_request)>16000 then raise exception using errcode='22023',message='Invalid request'; end if;
 if p_request - array['name','contact','relationship','location','statement','signature','consent','reason','detail'] <> '{}'::jsonb
  or (p_request->'consent') is distinct from 'true'::jsonb
  or coalesce(p_request->>'relationship','') not in ('depicted','representative','witness') then
  raise exception using errcode='22023',message='Invalid request'; end if;
 select * into tax from public.safety_removal_taxonomy_v1()
 where reason=p_request->>'reason' and detail=p_request->>'detail';
 if not found then raise exception using errcode='22023',message='Choose a valid category and reason'; end if;
 foreach k in array array['name','contact','location','statement','signature'] loop
  if jsonb_typeof(p_request->k) is distinct from 'string' or length(btrim(p_request->>k))<1
   or length(p_request->>k)>(case when k in ('location','statement') then 3000 when k='contact' then 500 else 160 end) then
   raise exception using errcode='22023',message='Invalid request'; end if;
 end loop;
 f:=encode(extensions.digest(p_request::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('safety-removal:'||p_id::text,0));
 select * into c from public.safety_removal_cases where id=p_id;
 if found then
  if c.token_hash<>p_token_hash or c.request_hash<>f then
   raise exception using errcode='22023',message='Request reference already used; check your receipt'; end if;
  return public.safety_removal_public_result_v1(p_id);
 end if;
 -- Intake-only ceiling, serialized independently of all member locks.
 insert into public.safety_removal_budget(name,window_at,used) values('submissions',date_trunc('hour',t),1)
 on conflict(name) do update set window_at=excluded.window_at,
 used=case when safety_removal_budget.window_at=excluded.window_at then safety_removal_budget.used+1 else 1 end
 returning used into n;
 if n>100 then raise exception using errcode='P0001',message='Intake temporarily busy; contact support'; end if;
 insert into public.safety_removal_cases(id,token_hash,request_hash,request,received_at,deadline_at,queue,priority)
 values(p_id,p_token_hash,f,p_request,t,t+case when tax.detail='nonconsensual_intimate_images' then interval '48 hours' else interval '24 hours' end,
 case when tax.restricted then 'restricted_safety' else 'moderation' end,
 case when tax.restricted then 'critical' when tax.reason in ('self_harm','violence_hate_exploitation') then 'high' else 'normal' end);
 insert into public.safety_removal_history(case_id,action) values(p_id,'received');
 -- Urgent operator alerts only; routine work is visible in the moderation queue.
 if tax.restricted or tax.reason in ('self_harm','violence_hate_exploitation') then
  insert into public.safety_removal_alerts(case_id) values(p_id);
 end if;
 perform public.enqueue_domain_event('moderation:global','moderation.safety.received',p_id,
  jsonb_build_object('caseId',p_id),'safety-received:'||p_id::text);
 return public.safety_removal_public_result_v1(p_id);
end$$;

create function public.get_safety_removal_status_v1(p_id uuid,p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception using errcode='42501',message='Service access required'; end if;
 if not exists(select 1 from public.safety_removal_cases where id=p_id and token_hash=p_token_hash) then
  raise exception using errcode='P0002',message='Receipt not found'; end if;
 return public.safety_removal_public_result_v1(p_id);
end$$;

create function public.get_admin_safety_removal_v1(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb; h jsonb;
begin
 perform public.safety_removal_authorize_v1(false,p_id);
 select to_jsonb(s)-'token_hash'-'request_hash' into c from public.safety_removal_cases s where id=p_id;
 if c is null then raise exception using errcode='P0002',message='Case unavailable'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by occurred_at desc,id desc),'[]'::jsonb) into h
 from (select id,occurred_at,action,internal_note,public_message,actor_id from public.safety_removal_history
 where case_id=p_id order by occurred_at desc,id desc limit 30) x;
 insert into public.admin_audit_log(actor_id,actor_role,action,entity_type,entity_id,metadata)
 values(auth.uid(),public.admin_current_operator_role(),'safety.case_viewed','safety_removal',p_id::text,'{}');
 return c||jsonb_build_object('classification',(select to_jsonb(t) from public.safety_removal_taxonomy_v1() t where t.reason=c#>>'{request,reason}' and t.detail=c#>>'{request,detail}'),
  'history',h,'can_write',public.admin_user_has_permission('moderation.write'),
  'alert_state',coalesce((select state from public.safety_removal_alerts where case_id=p_id),'not_required'));
end$$;

create function public.get_admin_safety_removals_v1(p_after_at timestamptz default null,p_after_id uuid default null,p_closed boolean default false,p_queue text default 'restricted_safety')
returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb; cursor jsonb;
begin
 perform public.safety_removal_authorize_v1();
 if p_queue is null or p_queue not in ('moderation','restricted_safety') then raise exception using errcode='22023',message='Invalid queue'; end if;
 if p_queue='restricted_safety' and not public.admin_user_has_permission('legal.read') then raise exception using errcode='42501',message='Restricted employee access required'; end if;
 if (p_after_at is null)<>(p_after_id is null) or p_closed is null then raise exception using errcode='22023',message='Invalid cursor'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by received_at,id),'[]'::jsonb) into a from (
 select id,received_at,deadline_at,state,revision,assigned_to,queue,priority,
  request->>'reason' reason,request->>'detail' detail,
  (select t.reason_label from public.safety_removal_taxonomy_v1() t where t.detail=request->>'detail') reason_label,
  (select t.detail_label from public.safety_removal_taxonomy_v1() t where t.detail=request->>'detail') detail_label,
  (select a.state from public.safety_removal_alerts a where a.case_id=safety_removal_cases.id) alert_state
 from public.safety_removal_cases
 where queue=p_queue and (closed_at is not null)=p_closed and (p_after_at is null or (received_at,id)>(p_after_at,p_after_id))
 order by received_at,id limit 26) x;
 if jsonb_array_length(a)>25 then
  a:=a-25; cursor:=jsonb_build_object('at',a#>>'{24,received_at}','id',a#>>'{24,id}'); end if;
 return jsonb_build_object('items',a,'next_cursor',cursor);
end$$;

create function public.admin_safety_removal_command_v1(p_id uuid,p_revision bigint,p_command_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.safety_removal_cases%rowtype; r public.safety_removal_receipts%rowtype;
 f text; action text; next_state text; note text; message text; linked uuid; result jsonb; key text;
begin
 perform public.safety_removal_authorize_v1(true,p_id);
 if p_id is null or p_revision is null or p_command_id is null or p_input is null or jsonb_typeof(p_input)<>'object'
  or pg_column_size(p_input)>16000 or p_input-array['action','note','message','report_id','copies_review','access_review']<>'{}'::jsonb then
  raise exception using errcode='22023',message='Invalid command'; end if;
 for key in select jsonb_object_keys(p_input) loop
  if jsonb_typeof(p_input->key)<>'string' then raise exception using errcode='22023',message='Command fields must be text'; end if;
 end loop;
 action:=p_input->>'action'; note:=btrim(p_input->>'note'); message:=btrim(p_input->>'message');
 if action is null or action not in ('claim','reviewing','needs_information','link_report','removed','not_actionable','reopen')
  or note is null or length(note) not between 10 and 2000 or length(coalesce(message,''))>2000 then
  raise exception using errcode='22023',message='A clear review rationale is required'; end if;
 f:=encode(extensions.digest(jsonb_build_array(p_id,p_revision,p_input)::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('safety-command:'||auth.uid()::text||p_command_id::text,0));
 select * into r from public.safety_removal_receipts where actor_id=auth.uid() and command_id=p_command_id;
 if found then
  if r.fingerprint<>f then raise exception using errcode='22023',message='Key belongs to a different command'; end if;
  return r.result;
 end if;
 select * into c from public.safety_removal_cases where id=p_id for update;
 if not found then raise exception using errcode='P0002',message='Case unavailable'; end if;
 if c.revision<>p_revision then raise exception using errcode='40001',message='Case changed; refresh before deciding'; end if;
 if c.closed_at is not null and action<>'reopen' then raise exception using errcode='22023',message='Reopen this case first'; end if;
 if action='reopen' and c.closed_at is null then raise exception using errcode='22023',message='Case is already open'; end if;
 next_state:=case when action='reopen' then 'reviewing' when action in ('claim','link_report') then c.state else action end;
 if action in ('needs_information','removed','not_actionable','reopen') and length(coalesce(message,''))<10 then
  raise exception using errcode='22023',message='A requester-visible response is required'; end if;
 linked:=c.report_id;
 if action='link_report' then
  linked:=(p_input->>'report_id')::uuid;
  -- Never bind an unrelated report merely because its category matches.
  -- The exact-target, fingerprint-checked handoff owns the association.
  if linked is distinct from c.report_id or c.report_id is null then
   raise exception using errcode='22023',message='Use the verified exact-target handoff to associate content'; end if;
  if not exists(select 1 from public.reports report join public.admin_report_triage t on t.report_id=report.id
   where report.id=linked and t.queue=c.queue and report.reason=c.request->>'reason' and report.reason_detail=c.request->>'detail') then
   raise exception using errcode='22023',message='An exact report with matching classification is required'; end if;
 end if;
 if action='removed' then
  if not exists(select 1 from public.reports report where report.id=linked and report.status='actioned'
   and case report.target_kind
    when 'post' then exists(select 1 from public.posts p where p.id=report.post_id and p.moderation_status='removed')
    when 'comment' then exists(select 1 from public.comments p where p.id=report.comment_id and p.moderation_status='removed')
    when 'poll_response' then exists(select 1 from public.poll_votes p where p.id=report.poll_vote_id and p.moderation_status='removed')
    when 'profile_photo' then exists(select 1 from public.profiles p where p.id=report.reported_user_id and p.avatar_url is null)
    else false end) then
   raise exception using errcode='22023',message='Complete the linked moderation decision first'; end if;
  if (c.request->>'detail'='nonconsensual_intimate_images' and length(btrim(coalesce(p_input->>'copies_review',''))) not between 20 and 2000)
   or length(btrim(coalesce(p_input->>'access_review',''))) not between 20 and 2000 then
   raise exception using errcode='22023',message='Document identical-copy search and access revocation verification'; end if;
 end if;
 update public.safety_removal_cases set state=next_state,report_id=linked,
 assigned_to=case when action='claim' then auth.uid() else assigned_to end,
 public_message=case when length(coalesce(message,''))>0 then message else public_message end,
 copies_review=case when action='removed' then p_input->>'copies_review' else copies_review end,
 access_review=case when action='removed' then p_input->>'access_review' else access_review end,
 closed_at=case when next_state in ('removed','not_actionable') then clock_timestamp() else null end,
 revision=revision+1,updated_at=clock_timestamp() where id=p_id;
 insert into public.safety_removal_history(case_id,actor_id,action,internal_note,public_message)
 values(p_id,auth.uid(),action,note,nullif(message,''));
 -- The ordinary audit stream gets identifiers only, never intimate allegations/contact.
 insert into public.admin_audit_log(actor_id,actor_role,action,entity_type,entity_id,request_id,metadata)
 values(auth.uid(),public.admin_current_operator_role(),'safety.'||action,'safety_removal',p_id::text,p_command_id::text,
 jsonb_build_object('revision',c.revision+1));
 perform public.enqueue_domain_event('moderation:global','moderation.safety.updated',p_id,
  jsonb_build_object('caseId',p_id),'safety-update:'||p_id::text||':'||(c.revision+1)::text);
 result:=jsonb_build_object('id',p_id,'revision',c.revision+1,'outcome','saved');
 insert into public.safety_removal_receipts values(auth.uid(),p_command_id,f,result);
 return result;
end$$;

revoke all on function public.safety_removal_authorize_v1(boolean,uuid),public.safety_removal_public_result_v1(uuid),
 public.submit_safety_removal_v1(uuid,text,jsonb),public.get_safety_removal_status_v1(uuid,text),
 public.get_admin_safety_removal_v1(uuid),public.get_admin_safety_removals_v1(timestamptz,uuid,boolean,text),
 public.admin_safety_removal_command_v1(uuid,bigint,uuid,jsonb) from public,anon,authenticated,doji_employee,service_role;
grant execute on function public.submit_safety_removal_v1(uuid,text,jsonb),public.get_safety_removal_status_v1(uuid,text) to service_role;
grant execute on function public.get_admin_safety_removal_v1(uuid),public.get_admin_safety_removals_v1(timestamptz,uuid,boolean,text),
 public.admin_safety_removal_command_v1(uuid,bigint,uuid,jsonb) to doji_employee;
commit;
