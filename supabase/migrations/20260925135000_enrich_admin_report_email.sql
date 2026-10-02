-- Give the protected administrator email function the same precise, bounded
-- report taxonomy the portal uses. The trigger remains one post-commit pg_net
-- handoff; it does not add another notification producer or expose evidence.

create or replace function public.trg_report_notify_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.doji_notify_admin_email(jsonb_build_object(
    'event', 'report',
    'report_id', new.id,
    'reporter_id', new.reporter_id,
    'reported_user_id', new.reported_user_id,
    'target_kind', new.target_kind,
    'post_id', new.post_id,
    'comment_id', new.comment_id,
    'poll_vote_id', new.poll_vote_id,
    'reason', new.reason,
    'reason_detail', new.reason_detail,
    'notes', new.notes,
    'created_at', new.created_at
  ));
  return new;
end;
$$;

revoke all on function public.trg_report_notify_admin() from public, anon, authenticated;

comment on function public.trg_report_notify_admin() is
  'Sends one bounded, evidence-free report alert payload to the protected administrator email function.';
