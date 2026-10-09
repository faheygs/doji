import { Alert, Stack, Typography } from '@mui/material';
import { RecordSection } from '@doji/ui';
import { RecordFields } from '../RecordLayout';
import type { ModerationRecord } from '@doji/portal-data/moderation-record';

const Values = RecordFields;
function Decision({
  value,
  title,
}: {
  value: NonNullable<ModerationRecord['report']['currentDecision']>;
  title: string;
}) {
  return (
    <RecordSection title={title}>
      <Values
        rows={[
          ['Decision', value.id],
          ['Action', value.action],
          ['State', value.state],
          ['Policy', value.policy_code],
          ['Severity', value.severity],
          ['Internal rationale', value.rationale],
          ['Member notice', value.member_notice],
          ['Account consequence', value.account_action],
          ['Consequence state', value.account_action_state],
          ['Decided at', value.decided_at],
          ['Restriction ends', value.restriction_ends_at],
        ]}
      />
    </RecordSection>
  );
}
export function ModerationSummary({ data, actor }: { data: ModerationRecord; actor: string }) {
  const { report, appeal, owner } = data;
  const assigned = owner ? owner.assigned_to : report.assignedTo;
  const label =
    assigned === null
      ? 'Unassigned'
      : assigned === actor
        ? 'Assigned to you'
        : owner?.owner_label || report.owner?.label || 'Employee ' + assigned;
  return (
    <RecordSection title="Case details">
      <Values
        rows={[
          ['Assignee', label],
          ['Source', appeal ? 'Member appeal' : 'In-app report'],
          ['Queue', data.restricted ? 'Restricted safety' : 'Trust & safety'],
          ['Report', report.id],
          ['Content type', report.targetKind],
          ['Priority', report.summary.priority],
          ['Category', report.summary.reason_label],
          ['Reason', report.summary.reason_detail_label],
          ['Reporter', report.reporter?.label],
          ['Reported member', report.subject?.label],
          ['Report notes', report.summary.notes],
        ]}
      />
    </RecordSection>
  );
}

export function ModerationDetails({ data }: { data: ModerationRecord }) {
  const { report, appeal } = data;
  return (
    <Stack sx={{ gap: 3 }}>
      {appeal && (
        <>
          <RecordSection title="Appeal statement">
            <Values
              rows={[
                ['Statement', appeal.appeal.statement],
                ['Submitted', appeal.appeal.submitted_at],
                ['Review response', appeal.appeal.review_reason],
                ['Reviewed', appeal.appeal.reviewed_at],
              ]}
            />
          </RecordSection>
          <Decision value={appeal.original} title="Decision being appealed" />
          <Alert severity="info">
            {appeal.historicalSnapshot
              ? 'Historical evidence is reported as retained; inspect available preserved decision media below.'
              : 'A full historical content snapshot was not retained. Current content below is not evidence of what the reviewer originally saw.'}
          </Alert>
          {!appeal.canReview && (
            <Alert severity="warning">
              Appeal review is unavailable:{' '}
              {appeal.blockedReason.replaceAll('_', ' ') || 'server eligibility denied'}.
            </Alert>
          )}
          {appeal.overrideRequired && (
            <Alert severity="warning">
              The original reviewer requires the existing explicit super-admin override to decide
              this appeal. Confirmation must explicitly acknowledge that override.
            </Alert>
          )}
        </>
      )}
      {!appeal && report.currentDecision && (
        <Decision value={report.currentDecision} title="Current report decision" />
      )}
      <RecordSection title="Current content">
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Current authorized record—not a historical snapshot.
        </Typography>
        {!report.contentExists && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            The reported content is no longer available.
          </Alert>
        )}
        <Values
          rows={[
            ['Content state', report.context.content_state],
            ['Created', report.context.content_created_at],
            ['Doji', report.context.challenge_title || report.context.daily_event_title],
            [
              'Original audience',
              report.context.audience_label || report.context.original_audience,
            ],
            [
              'Text',
              report.evidence.text ||
                report.evidence.caption ||
                report.evidence.body ||
                report.evidence.custom_text,
            ],
          ]}
        />
        {report.manifest.length > 0 && (
          <Alert severity="info">
            This case includes {report.manifest.length} protected media references. Use the
            protected media section below to authorize a preview; nothing loads automatically.
          </Alert>
        )}
      </RecordSection>
    </Stack>
  );
}
