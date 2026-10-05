import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260924150000_hierarchical_member_reporting.sql'),
  'utf8',
);
const adminAlignmentMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260924160000_align_admin_reporting_taxonomy.sql'),
  'utf8',
);
const adminContextMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260924162000_complete_admin_report_context.sql'),
  'utf8',
);
const adminHistoryMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260924163000_separate_report_workflow_history.sql'),
  'utf8',
);
const memberDeliveryMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260924164000_member_moderation_delivery.sql'),
  'utf8',
);
const restrictedReviewMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260924170000_restricted_safety_dispositions.sql'),
  'utf8',
);
const superAdminAppealMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260924180000_super_admin_appeal_authority.sql'),
  'utf8',
);
const criticalQuarantineMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260925120000_enforce_critical_report_quarantine.sql'),
  'utf8',
);
const reporterVisibilityMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260925121000_hide_pending_reported_posts_from_reporter.sql'),
  'utf8',
);
const policySuggestionMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260925122000_correct_report_policy_suggestions.sql'),
  'utf8',
);
const serializedReportMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260925123000_serialize_policy_report_commands.sql'),
  'utf8',
);
const reportedThreadVisibilityMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260925124000_hide_pending_reported_thread_items.sql'),
  'utf8',
);
const reporterVisibilityIndexMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260925125000_index_reporter_visibility_checks.sql'),
  'utf8',
);
const commentVisibilityRepairMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260925214500_fix_comment_report_visibility_rpc.sql'),
  'utf8',
);
const isolatedCommentSnapshotMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260925224500_isolate_member_comment_snapshot.sql'),
  'utf8',
);
const relay = fs.readFileSync(
  path.join(root, 'supabase/functions/relay-domain-events/index.ts'),
  'utf8',
);
const hook = fs.readFileSync(path.join(root, 'hooks/useReportContent.ts'), 'utf8');
const portal = fs.readFileSync(path.join(root, 'website/portal.mts'), 'utf8');

describe('hierarchical reporting contract', () => {
  it('keeps the installed-client command while adding the target-specific command', () => {
    expect(migration).toContain('create or replace function public.submit_policy_report');
    expect(migration).not.toContain('drop function public.submit_content_report');
    expect(hook).toContain("executeCommand('submit_policy_report'");
    expect(serializedReportMigration).toContain('pg_advisory_xact_lock');
    expect(serializedReportMigration).toContain("receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key");
  });

  it('binds content reports to authoritative owners and separates account from avatar', () => {
    expect(migration).toContain('public.can_view_full_post(post.id, uid)');
    expect(migration).toContain("p_target_kind in ('profile_photo', 'account')");
    expect(migration).toContain("report_target = 'account'");
    expect(migration).toContain("set content_kind = 'account'");
  });

  it('routes high-risk leaves to restricted review without treating all sexual content as critical', () => {
    expect(migration).toContain("'child_sexual_content'");
    expect(migration).toContain("case when restricted_detail then 'restricted_safety'");
    expect(migration).not.toContain("p_reason = 'sexual_content' then 'restricted_safety'");
  });

  it('atomically quarantines exact content for critical leaves and repairs open cases', () => {
    expect(criticalQuarantineMigration).toContain('after insert on public.reports');
    expect(criticalQuarantineMigration).toContain("new.reason_detail not in (");
    expect(criticalQuarantineMigration).toContain("new.target_kind = 'post'");
    expect(criticalQuarantineMigration).toContain("new.target_kind = 'comment'");
    expect(criticalQuarantineMigration).toContain("new.target_kind = 'poll_response'");
    expect(criticalQuarantineMigration).toContain("set moderation_status = 'quarantined'");
    expect(criticalQuarantineMigration).toContain("triage.queue = 'restricted_safety'");
    expect(hook).toContain("page.filter((post) => post.id !== postId)");
    expect(hook).toContain("scheduleQueryInvalidation(queryClient");
  });

  it('hides a pending reported post from its reporter across authoritative reads', () => {
    expect(reporterVisibilityMigration).toContain('publish_reporter_visibility_change');
    expect(reporterVisibilityMigration).toContain("'moderation.status.changed'");
    expect(reporterVisibilityMigration).toContain('report.reporter_id = uid');
    expect(reporterVisibilityMigration).toContain('report.reporter_id = p_viewer');
    expect(reporterVisibilityMigration).toContain('report.status = \'pending\'');
    expect(reporterVisibilityMigration).toContain('create or replace function public.get_post_detail');
    expect(reporterVisibilityMigration).toContain('create or replace function public.get_feed_page_snapshot_v2');
  });

  it('hides exact pending comment and poll-response reports from their reporter', () => {
    expect(reportedThreadVisibilityMigration).toContain('create or replace function public.get_comment_thread_snapshot');
    expect(reportedThreadVisibilityMigration).toContain('report.comment_id = comment.id');
    expect(reportedThreadVisibilityMigration).toContain('create or replace function public.get_poll_snapshot_for_feed');
    expect(reportedThreadVisibilityMigration).toContain('report.poll_vote_id = vote.id');
    expect(reportedThreadVisibilityMigration).toContain("report.status = 'pending'");
    expect(reporterVisibilityIndexMigration).toContain('reports_pending_reporter_post_idx');
    expect(reporterVisibilityIndexMigration).toContain('reports_pending_reporter_comment_idx');
    expect(reporterVisibilityIndexMigration).toContain('reports_pending_reporter_poll_vote_idx');
    expect(commentVisibilityRepairMigration).toContain('security definer');
    expect(commentVisibilityRepairMigration).toContain('report.reporter_id = auth.uid()');
    expect(commentVisibilityRepairMigration).toContain('has_pending_own_comment_report(comment.id)');
    expect(commentVisibilityRepairMigration).toContain(
      'revoke all on function public.has_pending_own_comment_report(uuid) from public, anon',
    );
    expect(isolatedCommentSnapshotMigration).toContain('security definer');
    expect(isolatedCommentSnapshotMigration).toContain("where auth.uid() is not null");
    expect(isolatedCommentSnapshotMigration).toContain("set search_path = ''");
    expect(isolatedCommentSnapshotMigration).toContain(
      'revoke all on function public.get_comment_thread_snapshot',
    );
  });

  it('keeps operator actions target-specific', () => {
    expect(portal).toContain("evidence.kind === 'profile_photo'");
    expect(portal).toContain("evidence.kind === 'account'");
  });

  it('renders complete authorized details for ordinary and restricted report queues', () => {
    expect(portal).toMatch(/function isLiveReportItem\(item:\s*WorkItem\s*\|\s*null\)/);
    expect(portal).toContain("['moderation', 'safety'].includes(item.queue)");
    expect(portal).toContain('const liveReportItem = isLiveReportItem(item)');
    expect(portal).toContain('activeCaseDetail && liveReportItem');
    expect(portal).toContain('activeCaseDetail && isLiveReportItem(item)');
  });

  it('explains appeal conflicts instead of presenting a dead decision form', () => {
    expect(portal).toMatch(/function appealActionBlocker\(item:\s*WorkItem\)/);
    expect(portal).toContain('Independent reviewer required');
    expect(portal).toContain('A different Doji admin with MFA and moderation access');
    expect(portal).toContain("['moderation', 'safety'].includes(activeItem.queue)");
    expect(portal).toContain("byId('decisionReasonField').hidden = Boolean(appealBlocker)");
  });

  it('lets the super admin resolve their own appeal case with an explicit audit marker', () => {
    expect(superAdminAppealMigration).toContain("actor_role = 'super_admin'");
    expect(superAdminAppealMigration).toContain("'superAdminOverride', super_admin_override");
    expect(superAdminAppealMigration).toContain("'super_admin_override', super_admin_override");
    expect(portal).toContain("liveSession.roles.includes('super_admin')");
    expect(portal).toContain('Super admin authority');
    expect(portal).toContain('Super admin override · fully audited');
  });

  it('keeps the admin policy catalog and decision constraint aligned with member reports', () => {
    expect(adminAlignmentMigration).toContain("'restricted_goods'");
    expect(adminAlignmentMigration).toContain("'self_harm'");
    expect(adminAlignmentMigration).toContain("'human_exploitation'");
    expect(adminAlignmentMigration).toContain("'suggested_policy_code'");
    expect(adminAlignmentMigration).toContain("'related_context'");
    expect(portal).toContain('Suggested from the member report. Confirm independently');
    expect(policySuggestionMigration).toContain("detail = 'hate_speech' then 'hate'");
    expect(policySuggestionMigration).not.toContain("detail = 'credible_threat' then 'hate'");
    expect(policySuggestionMigration).toContain("then 'violence_threats'");
  });

  it('keeps case context bounded and separate from consumer app reads', () => {
    expect(adminContextMigration).toContain("'case_context'");
    expect(adminContextMigration).toContain("'content_state'");
    expect(adminContextMigration).toContain("'challenge_title'");
    expect(adminContextMigration).not.toContain('service_role');
    expect(portal).toContain('Content state');
    expect(portal).toContain('Case context');
  });

  it('separates report workflow history from immutable evidence-access auditing', () => {
    expect(adminHistoryMigration).toContain("'workflow_history'");
    expect(adminHistoryMigration).toContain("'evidence_access'");
    expect(adminHistoryMigration).toContain("audit.action <> 'report.evidence_viewed'");
    expect(adminHistoryMigration).toContain('raw access records remain immutable in admin_audit_log');
    expect(portal).toContain('Current triage state');
    expect(portal).toContain('Full immutable access history remains available in Audit Log');
  });

  it('delivers finalized removal notices without emailing quarantine investigations', () => {
    expect(memberDeliveryMigration).toContain("'sendPush', true");
    expect(memberDeliveryMigration).toContain("'sendEmail', p_severity = 'level_2'");
    expect(memberDeliveryMigration).toContain("p_action in ('remove_content', 'remove_profile_photo')");
    expect(memberDeliveryMigration).not.toContain("p_action = 'escalate_restricted' then true");
    expect(relay).toContain("'Idempotency-Key': `moderation-decision/${copy.decisionId}`");
    expect(relay).toContain("database.auth.admin.getUserById(copy.userId)");
    expect(relay).toContain('member_moderation_email_deliveries');
  });

  it('keeps restricted account consequences explicit, expiring, and reversible', () => {
    expect(restrictedReviewMigration).toContain('create or replace function public.admin_decide_report_v3');
    expect(restrictedReviewMigration).toContain("p_account_action not in ('warning', 'temporary_restriction', 'permanent_ban')");
    expect(restrictedReviewMigration).toContain("p_restriction_days not in (1, 3, 7, 30)");
    expect(restrictedReviewMigration).toContain('action_row.ends_at > clock_timestamp()');
    expect(restrictedReviewMigration).toContain('moderation_account_content_states');
    expect(restrictedReviewMigration).not.toContain('delete from public.posts');
    expect(restrictedReviewMigration).toContain('update public.profiles set is_banned = false');
    expect(restrictedReviewMigration).toContain("'sendEmail', p_severity in ('level_2', 'level_3')");
    expect(relay).toContain("'level_1', 'level_2', 'level_3'");
    expect(portal).toContain("['moderation', 'safety'].includes(activeItem.queue)");
  });
});
