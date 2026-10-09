-- Preparation only. Owner approved local testing, not deployment.
-- No gateway route/bridge allowlist is enabled by this candidate.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';

-- Deliberately CREATE, not CREATE OR REPLACE: never overwrite an unknown release.
create function public.admin_announcement_compose_v1(
  p_action text, p_id uuid, p_version text, p_input jsonb, p_request_id uuid
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  key text:='announcement.compose.v1:'||p_request_id::text;
  fingerprint text;
  receipt jsonb;
  item jsonb;
  payload jsonb:=p_input;
  result jsonb;
  start_at timestamptz;
  summary text;
begin
  -- Authorization precedes replay, including the employee row lock and AAL2.
  perform public.admin_editorial_authorize_v1(true);
  if p_action is null or p_action not in ('save_draft','publish','schedule')
    or p_request_id is null or p_input is null or jsonb_typeof(p_input)<>'object'
    or octet_length(p_input::text)>8192
    or (p_id is null) <> (p_version is null)
    or (p_version is not null and p_version !~ '^[0-9a-f]{32}$') then
    raise exception using errcode='22023',message='Invalid announcement command';
  end if;
  fingerprint:=encode(sha256(convert_to(
    jsonb_build_array(p_action,p_id,p_version,p_input)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||key,0));
  select r.result into receipt from public.admin_employee_command_receipts r
    where r.user_id=actor and r.idempotency_key=key;
  if found then
    if receipt->>'operation' is distinct from 'announcement.compose.v1'
      or receipt->>'fingerprint' is distinct from fingerprint then
      raise exception using errcode='22023',message='Retry key belongs to a different command';
    end if;
    begin
      item:=public.get_admin_editorial_item_v1('announcements',(receipt#>>'{result,id}')::uuid);
    exception when no_data_found then item:=null;
    end;
    return jsonb_build_object('item',item,'command',receipt->'result','replayed',true);
  end if;

  -- Reserve both internal keys in the same order as the legacy command. A
  -- pre-existing legacy receipt must never be mistaken for this transaction.
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||key||':save',0));
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||key||':publish',0));
  if exists(select 1 from public.admin_employee_command_receipts r where r.user_id=actor
    and r.idempotency_key in (key||':save',key||':publish')) then
    raise exception using errcode='22023',message='Announcement request key is already reserved';
  end if;

  if p_action='publish' then
    -- "Publish now" uses server time, never the browser clock. Reject a hidden
    -- schedule rather than silently publishing it early.
    if p_input ? 'starts_at' and p_input->'starts_at'<>'null'::jsonb then
      raise exception using errcode='22023',message='Publish now must not include a scheduled start';
    end if;
    -- Match the transaction clock used by the existing eligibility/read contract.
    payload:=payload||jsonb_build_object('starts_at',transaction_timestamp());
  elsif p_action='schedule' then
    if jsonb_typeof(p_input->'starts_at') is distinct from 'string' then
      raise exception using errcode='22023',message='Choose a future start date and time';
    end if;
    start_at:=(p_input->>'starts_at')::timestamptz;
    if not isfinite(start_at) or start_at<=clock_timestamp() then
      raise exception using errcode='22023',message='Choose a future start date and time';
    end if;
  end if;
  summary:=case p_action
    when 'save_draft' then 'System action summary: save announcement draft'
    when 'publish' then 'System action summary: publish announcement now'
    else 'System action summary: schedule announcement' end;
  item:=public.admin_editorial_command_v1('announcements',
    case when p_id is null then 'create' else 'save' end,
    p_id,p_version,payload,summary,key||':save');
  if p_action<>'save_draft' then
    item:=public.admin_editorial_command_v1('announcements','publish',
      (item->>'id')::uuid,item->>'version','{}'::jsonb,summary,key||':publish');
  end if;
  -- Only IDs/outcome are retained; content stays in its authoritative record.
  result:=jsonb_build_object('id',item->>'id','action',p_action,
    'version',item->>'version','state',item->>'state',
    'display_state',item->>'display_state','request_id',p_request_id);
  insert into public.admin_employee_command_receipts(user_id,idempotency_key,result)
    values(actor,key,jsonb_build_object('operation','announcement.compose.v1',
      'fingerprint',fingerprint,'result',result));
  return jsonb_build_object('item',item,'command',result,'replayed',false);
end$$;
revoke all on function public.admin_announcement_compose_v1(text,uuid,text,jsonb,uuid)
  from public,anon,authenticated,service_role,doji_employee;
grant execute on function public.admin_announcement_compose_v1(text,uuid,text,jsonb,uuid)
  to doji_employee;
comment on function public.admin_announcement_compose_v1(text,uuid,text,jsonb,uuid) is
  'Employee-only atomic announcement composition. Preparation candidate; gateway activation separately gated.';
commit;
