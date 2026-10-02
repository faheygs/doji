-- Keep the protected report read backward-compatible while exposing the bounded
-- context an operator needs to understand one case without querying app tables.
alter function public.get_admin_report_case_v2(uuid)
  rename to get_admin_report_case_v2_before_context_20260924;

revoke all on function public.get_admin_report_case_v2_before_context_20260924(uuid)
  from public, anon, authenticated;

create function public.get_admin_report_case_v2(p_report_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  base jsonb;
  context jsonb;
begin
  -- The prior protected function retains the AAL2/permission checks and writes
  -- the immutable evidence-view audit entry exactly once for this request.
  base := public.get_admin_report_case_v2_before_context_20260924(p_report_id);

  select jsonb_build_object(
    'source', 'In-app member report',
    'target_kind', report.target_kind,
    'content_created_at', case report.target_kind
      when 'post' then post.created_at
      when 'comment' then comment.created_at
      when 'poll_response' then vote.created_at
      else null
    end,
    'content_state', case report.target_kind
      when 'post' then coalesce(post.moderation_status, 'unavailable')
      when 'comment' then coalesce(comment.moderation_status, 'unavailable')
      when 'poll_response' then coalesce(vote.moderation_status, 'unavailable')
      when 'profile_photo' then case
        when reported.id is null then 'unavailable'
        when reported.is_banned then 'banned'
        else 'active'
      end
      when 'account' then case
        when reported.id is null then 'unavailable'
        when reported.is_banned then 'banned'
        else 'active'
      end
      else 'unavailable'
    end,
    'audience', case
      when report.target_kind = 'post' then post.visibility
      when report.target_kind = 'comment' then parent_post.visibility
      when report.target_kind = 'poll_response' then 'public'
      else null
    end,
    'audience_label', case
      when report.target_kind = 'poll_response' then 'Everyone'
      when coalesce(post.visibility, parent_post.visibility) = 'friends' then 'Friends'
      when coalesce(post.visibility, parent_post.visibility) = 'public' then 'Everyone'
      else null
    end,
    'daily_event_id', coalesce(post.daily_event_id, parent_post.daily_event_id, vote.daily_event_id),
    'challenge_title', challenge.title
  )
  into context
  from public.reports report
  left join public.posts post on post.id = report.post_id
  left join public.comments comment on comment.id = report.comment_id
  left join public.posts parent_post on parent_post.id = comment.post_id
  left join public.poll_votes vote on vote.id = report.poll_vote_id
  left join public.profiles reported on reported.id = report.reported_user_id
  left join public.daily_events event on event.id = coalesce(
    post.daily_event_id,
    parent_post.daily_event_id,
    vote.daily_event_id
  )
  left join public.challenges challenge on challenge.id = coalesce(event.challenge_id, vote.challenge_id)
  where report.id = p_report_id;

  return base || jsonb_build_object('case_context', coalesce(context, '{}'::jsonb));
end;
$$;

revoke all on function public.get_admin_report_case_v2(uuid) from public, anon;
grant execute on function public.get_admin_report_case_v2(uuid) to authenticated;

comment on function public.get_admin_report_case_v2(uuid) is
  'Returns one AAL2-authorized report with exact taxonomy, safe identities, evidence, bounded history, and source-of-truth content context.';
