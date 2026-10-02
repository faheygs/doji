-- Finalized removals notify the affected member through the existing durable
-- Activity Center plus the server-owned push outbox. Level 2 removals may also
-- produce one idempotent transactional email. Quarantine is investigative, not
-- a final violation, and intentionally remains silent.

alter table public.notification_attention_state
  drop constraint if exists notification_attention_state_scope_kind_check;
alter table public.notification_attention_state
  add constraint notification_attention_state_scope_kind_check check (
    scope_kind in ('daily_event', 'friendship', 'comment', 'suggestion', 'moderation_decision')
  );

create table if not exists public.member_moderation_email_deliveries (
  event_id uuid primary key,
  decision_id uuid not null references public.moderation_decisions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('sent', 'skipped', 'failed')),
  provider_id text,
  last_error text,
  attempted_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  unique (decision_id)
);

create index if not exists member_moderation_email_user_idx
  on public.member_moderation_email_deliveries (user_id, attempted_at desc);

alter table public.member_moderation_email_deliveries enable row level security;
revoke all on table public.member_moderation_email_deliveries
  from public, anon, authenticated;
grant select, insert, update on table public.member_moderation_email_deliveries
  to service_role;

comment on table public.member_moderation_email_deliveries is
  'Service-only delivery ledger for one transactional member email per finalized serious moderation decision.';

create or replace function public.enforce_os_push_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed boolean := false;
begin
  allowed :=
    (new.event_type = 'doji.activated' and coalesce((new.payload ->> 'broadcastPush')::boolean, false))
    or (
      coalesce((new.payload ->> 'sendPush')::boolean, false)
      and (
        new.event_type in (
          'notification.friend_request.created',
          'notification.mention.created',
          'notification.comment_reply.created',
          'notification.suggestion.reviewed'
        )
        or (
          new.event_type = 'moderation.status.changed'
          and exists (
            select 1
            from public.moderation_decisions decision
            where decision.id = new.aggregate_id
              and decision.affected_user_id::text = new.payload ->> 'targetUserId'
              and decision.action in ('remove_content', 'remove_profile_photo')
              and decision.state = 'active'
          )
        )
      )
    );

  if allowed then
    new.available_at := least(coalesce(new.available_at, clock_timestamp()), clock_timestamp());
    new.payload := jsonb_set(
      new.payload,
      '{preferenceKey}',
      to_jsonb(case
        when new.event_type = 'doji.activated' then 'doji_live'
        when new.event_type = 'notification.friend_request.created' then 'friend_requests'
        when new.event_type in (
          'notification.mention.created', 'notification.comment_reply.created'
        ) then 'mentions_replies'
        else 'reviews_account'
      end),
      true
    );
    return new;
  end if;

  if new.event_type in (
    'notification.friend_activity.grouped',
    'notification.reactions.grouped',
    'notification.comment_likes.grouped'
  ) then
    return null;
  end if;

  if coalesce((new.payload ->> 'sendPush')::boolean, false)
     or coalesce((new.payload ->> 'broadcastPush')::boolean, false) then
    new.payload := jsonb_set(new.payload, '{sendPush}', 'false'::jsonb, true) - 'broadcastPush';
    new.available_at := least(coalesce(new.available_at, clock_timestamp()), clock_timestamp());
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_os_push_policy()
  from public, anon, authenticated;

alter function public.admin_decide_report_v2(uuid, text, text, text, text, text, text)
  rename to admin_decide_report_v2_before_member_delivery_20260924;

revoke all on function public.admin_decide_report_v2_before_member_delivery_20260924(
  uuid, text, text, text, text, text, text
) from public, anon, authenticated;

create function public.admin_decide_report_v2(
  p_report_id uuid,
  p_action text,
  p_policy_code text,
  p_severity text,
  p_reason text,
  p_user_notice text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  decision_id uuid;
  affected_user_id uuid;
begin
  result := public.admin_decide_report_v2_before_member_delivery_20260924(
    p_report_id, p_action, p_policy_code, p_severity,
    p_reason, p_user_notice, p_idempotency_key
  );

  if p_action in ('remove_content', 'remove_profile_photo') then
    decision_id := nullif(result ->> 'decision_id', '')::uuid;
    select decision.affected_user_id
    into affected_user_id
    from public.moderation_decisions decision
    where decision.id = decision_id;

    if decision_id is not null and affected_user_id is not null then
      update public.domain_event_outbox event
      set payload = event.payload || jsonb_build_object(
        'version', 2,
        'decisionId', decision_id,
        'targetUserId', affected_user_id,
        'sendPush', true,
        'sendEmail', p_severity = 'level_2',
        'type', 'MODERATION',
        'url', '/(app)/profile/account-status'
      ),
          available_at = least(event.available_at, clock_timestamp())
      where event.event_type = 'moderation.status.changed'
        and event.aggregate_id = decision_id
        and event.published_at is null;
    end if;
  end if;

  return result;
end;
$$;

revoke all on function public.admin_decide_report_v2(uuid, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.admin_decide_report_v2(uuid, text, text, text, text, text, text)
  to authenticated;

comment on function public.admin_decide_report_v2(uuid, text, text, text, text, text, text) is
  'Records one classified moderation outcome; finalized removals add durable in-app and push delivery, with email reserved for Level 2 enforcement.';
