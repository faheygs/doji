import { MenuItem, Stack, TextField } from '@mui/material';
import { policies, type ModerationInput } from '@doji/portal-data/moderation-command';
import type { ModerationRecord } from '@doji/portal-data/moderation-record';
export type ModerationDraft = {
  fingerprint: string;
  action: string;
  policy: string;
  severity: string;
  account: string;
  days: string;
  reason: string;
  notice: string;
  priority: string;
};
// Reading evidence updates access counters. Those counters must not invalidate
// an otherwise unchanged decision form; workflow/evidence/ownership/decision still do.
export const caseFingerprint = (item: ModerationRecord) => {
  const report = { ...item.report, history: { workflow: item.report.history.workflow } };
  const appeal = item.appeal ? { ...item.appeal, report } : null;
  return JSON.stringify({ ...item, report, appeal });
};
export function initialDraft(item: ModerationRecord): ModerationDraft {
  return {
    fingerprint: caseFingerprint(item),
    action: '',
    policy: '',
    severity: '',
    account: '',
    days: '',
    reason: '',
    notice: '',
    priority: '',
  };
}
export function draftCommand(
  item: ModerationRecord,
  draft: ModerationDraft,
): Omit<ModerationInput, 'key'> {
  const base = {
    id: item.appeal?.id ?? item.report.id,
    restricted: item.restricted,
    action: draft.action,
  };
  if (item.appeal)
    return {
      ...base,
      kind: 'appeal',
      reason: draft.reason.trim(),
      decisionId: item.appeal.original.id,
    };
  if (['reopen', 'reclose'].includes(draft.action))
    return {
      ...base,
      kind: 'review',
      reason: draft.reason.trim(),
      decisionId: item.report.currentDecision?.id ?? '',
    };
  if (draft.action === 'set_priority') return { ...base, kind: 'triage', priority: draft.priority };
  const dismiss = draft.action === 'no_violation',
    restriction = item.restricted && !dismiss;
  return {
    ...base,
    kind: 'decision',
    reason: draft.reason.trim(),
    notice: draft.notice.trim(),
    policy: dismiss ? 'no_violation' : draft.policy,
    severity: dismiss ? 'none' : draft.severity,
    account: restriction ? draft.account : null,
    days: restriction && draft.account === 'temporary_restriction' ? Number(draft.days) : null,
  };
}
export function actionChoices(item: ModerationRecord): [string, string][] {
  if (item.appeal)
    return [
      ['uphold', 'Uphold original decision'],
      ['reverse', 'Reverse original decision'],
    ];
  const report = item.report,
    final =
      report.currentDecision &&
      report.currentDecision.state === 'active' &&
      report.currentDecision.action !== 'quarantine';
  if (report.summary.status !== 'pending')
    return final ? [['reopen', 'Reopen review (keep enforcement)']] : [];
  if (final) return [['reclose', 'Close follow-up review (keep enforcement)']];
  return [
    ['no_violation', 'Close with no violation'],
    ...(report.contentExists && ['post', 'comment', 'poll_response'].includes(report.targetKind)
      ? [['remove_content', 'Remove reported content'] as [string, string]]
      : []),
    ...(report.targetKind === 'profile_photo' && report.hasProfilePhoto
      ? [['remove_profile_photo', 'Remove profile photo'] as [string, string]]
      : []),
    ...(!item.restricted
      ? [['escalate_restricted', 'Quarantine and escalate'] as [string, string]]
      : []),
    ['set_priority', 'Change priority'],
  ];
}
export function ModerationFields({
  item,
  draft,
  change,
  disabled,
}: {
  item: ModerationRecord;
  draft: ModerationDraft;
  change: (value: ModerationDraft) => void;
  disabled: boolean;
}) {
  const set = (key: keyof ModerationDraft, value: string) => change({ ...draft, [key]: value });
  const classified = ['remove_content', 'remove_profile_photo', 'escalate_restricted'].includes(
    draft.action,
  );
  const reason = !!draft.action && !['release', 'set_priority'].includes(draft.action);
  const decision = !item.appeal && (classified || draft.action === 'no_violation');
  const select = (label: string, key: keyof ModerationDraft, values: [string, string][]) => (
    <TextField
      select
      fullWidth
      label={label}
      value={draft[key]}
      disabled={disabled}
      onChange={(event) => set(key, event.target.value)}
    >
      <MenuItem value="">Choose an option</MenuItem>
      {values.map(([value, title]) => (
        <MenuItem key={value} value={value}>
          {title}
        </MenuItem>
      ))}
    </TextField>
  );
  return (
    <Stack sx={{ gap: 2 }}>
      {select('Action', 'action', actionChoices(item))}
      {draft.action === 'set_priority' &&
        select(
          'Priority',
          'priority',
          ['low', 'normal', 'high', 'critical'].map((v) => [v, v]),
        )}
      {classified && (
        <>
          {select(
            'Policy',
            'policy',
            policies.map((v) => [v, v.replaceAll('_', ' ')]),
          )}
          {select(
            'Severity',
            'severity',
            (item.restricted || draft.action === 'escalate_restricted'
              ? ['level_2', 'level_3']
              : ['level_1', 'level_2']
            ).map((v) => [v, v.replace('_', ' ')]),
          )}
          {item.restricted && (
            <>
              {select('Account consequence', 'account', [
                ['warning', 'Warning — keep account active'],
                ['temporary_restriction', 'Temporary participation restriction'],
                ['permanent_ban', 'Permanent suspension — preserve account records'],
              ])}
              {draft.account === 'temporary_restriction' &&
                select(
                  'Restriction duration',
                  'days',
                  [1, 3, 7, 30].map((v) => [String(v), `${v} day${v === 1 ? '' : 's'}`]),
                )}
            </>
          )}
        </>
      )}
      {reason && (
        <TextField
          fullWidth
          multiline
          minRows={3}
          required
          label={item.appeal ? 'Review explanation (shown to member)' : 'Internal rationale'}
          value={draft.reason}
          disabled={disabled}
          onChange={(e) => set('reason', e.target.value)}
          helperText="10–1,000 characters"
          slotProps={{ htmlInput: { maxLength: 1000 } }}
        />
      )}
      {decision && (
        <TextField
          fullWidth
          multiline
          minRows={3}
          required
          label="Member notice"
          value={draft.notice}
          disabled={disabled}
          onChange={(e) => set('notice', e.target.value)}
          helperText="10–1,000 characters. Explain the outcome clearly."
          slotProps={{ htmlInput: { maxLength: 1000 } }}
        />
      )}
    </Stack>
  );
}
