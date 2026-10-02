-- A safety-critical leaf is itself the server-owned signal to quarantine the
-- exact reported content. Keep this enforcement on the report insert so every
-- caller, including installed clients and future intake surfaces, receives the
-- same atomic behavior.

create or replace function public.enforce_critical_report_quarantine()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reason_detail not in (
    'credible_threat',
    'human_exploitation',
    'nonconsensual_intimate_images',
    'sexual_exploitation',
    'child_sexual_content'
  ) then
    return new;
  end if;

  if new.target_kind = 'post' then
    update public.posts
    set moderation_status = 'quarantined'
    where id = new.post_id
      and moderation_status = 'visible';
  elsif new.target_kind = 'comment' then
    update public.comments
    set moderation_status = 'quarantined'
    where id = new.comment_id
      and moderation_status = 'visible';
  elsif new.target_kind = 'poll_response' then
    update public.poll_votes
    set moderation_status = 'quarantined'
    where id = new.poll_vote_id
      and moderation_status = 'visible';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_critical_report_quarantine()
  from public, anon, authenticated;

drop trigger if exists enforce_critical_report_quarantine on public.reports;
create trigger enforce_critical_report_quarantine
after insert on public.reports
for each row execute function public.enforce_critical_report_quarantine();

-- Repair any pending restricted cases created after hierarchical reporting was
-- deployed but before this invariant was enforced. These updates use the same
-- normal content triggers, so connected clients receive identifier-only hints
-- and reconcile through the authoritative snapshots.
update public.posts post
set moderation_status = 'quarantined'
from public.reports report
join public.admin_report_triage triage on triage.report_id = report.id
where report.post_id = post.id
  and report.status = 'pending'
  and triage.queue = 'restricted_safety'
  and post.moderation_status = 'visible';

update public.comments comment
set moderation_status = 'quarantined'
from public.reports report
join public.admin_report_triage triage on triage.report_id = report.id
where report.comment_id = comment.id
  and report.status = 'pending'
  and triage.queue = 'restricted_safety'
  and comment.moderation_status = 'visible';

update public.poll_votes vote
set moderation_status = 'quarantined'
from public.reports report
join public.admin_report_triage triage on triage.report_id = report.id
where report.poll_vote_id = vote.id
  and report.status = 'pending'
  and triage.queue = 'restricted_safety'
  and vote.moderation_status = 'visible';

comment on function public.enforce_critical_report_quarantine() is
  'Atomically quarantines the exact content target for an approved critical report leaf.';
