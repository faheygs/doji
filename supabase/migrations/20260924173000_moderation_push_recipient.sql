-- A permanent suspension marks the profile banned before its durable moderation
-- event is relayed. Normal social push recipient resolution intentionally omits
-- banned profiles, so expose a tightly scoped service-role-only lookup for the
-- final moderation notice without weakening any other push path.
create or replace function public.get_moderation_push_recipient(p_user_id uuid)
returns table (
  user_id uuid,
  notification_token text,
  notification_preferences jsonb,
  native_endpoints jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id, profile.notification_token, profile.notification_preferences,
         coalesce(native.endpoints, '[]'::jsonb)
  from public.profiles profile
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'installationId', endpoint.installation_id,
      'token', endpoint.token,
      'provider', endpoint.provider,
      'environment', endpoint.environment,
      'notificationContractVersion', endpoint.notification_contract_version
    ) order by endpoint.last_registered_at desc, endpoint.id desc) endpoints
    from (
      select endpoint.installation_id, endpoint.token, endpoint.provider,
             endpoint.environment, endpoint.notification_contract_version,
             endpoint.last_registered_at, endpoint.id
      from public.device_push_endpoints endpoint
      where endpoint.user_id = profile.id and endpoint.active = true
      order by endpoint.last_registered_at desc, endpoint.id desc
      limit 5
    ) endpoint
  ) native on true
  where profile.id = p_user_id
    and exists (
      select 1
      from public.moderation_account_actions action_row
      where action_row.user_id = profile.id
        and action_row.action = 'permanent_ban'
        and action_row.state = 'active'
    );
$$;

revoke all on function public.get_moderation_push_recipient(uuid)
  from public, anon, authenticated;
grant execute on function public.get_moderation_push_recipient(uuid) to service_role;
