import { Alert, MenuItem, Stack, TextField } from '@mui/material';
import { RecordSection } from '@doji/ui';
import {
  safetyActions,
  type SafetyAction,
  type SafetyInput,
} from '@doji/portal-data/safety-command';
import type { SafetyRecord } from '@doji/portal-data/safety-record';

export type SafetyDraft = {
  revision: number;
  action: SafetyAction;
  note: string;
  message: string;
  access: string;
  copies: string;
};
export function safetyDraftInput(draft: SafetyDraft, item: SafetyRecord): SafetyInput {
  return {
    action: draft.action,
    note: draft.action === 'reviewing' ? 'Review started by assigned employee.' : draft.note.trim(),
    ...(draft.action === 'reviewing' ? {} : { message: draft.message.trim() }),
    ...(draft.action === 'removed'
      ? {
          access_review: draft.access.trim(),
          ...(item.request.detail === 'nonconsensual_intimate_images'
            ? { copies_review: draft.copies.trim() }
            : {}),
        }
      : {}),
  };
}
export function SafetyFields({
  item,
  draft,
  setDraft,
  disabled,
}: {
  item: SafetyRecord;
  draft: SafetyDraft | null;
  setDraft: (draft: SafetyDraft) => void;
  disabled: boolean;
}) {
  const actions: SafetyAction[] = item.closedAt
    ? ['reopen']
    : [
        'reviewing',
        'needs_information',
        ...(item.reportId ? ['removed' as const] : []),
        'not_actionable',
      ];
  return (
    <RecordSection title="Case outcome">
      <Stack sx={{ gap: 2 }}>
        <TextField
          select
          fullWidth
          label="Action"
          value={draft?.action ?? ''}
          disabled={disabled}
          onChange={(event) =>
            setDraft({
              revision: item.revision,
              action: event.target.value as SafetyAction,
              note: '',
              message: '',
              access: '',
              copies: '',
            })
          }
        >
          {actions.map((action) => (
            <MenuItem key={action} value={action}>
              {safetyActions[action]}
            </MenuItem>
          ))}
        </TextField>
        {draft && draft.action !== 'reviewing' && (
          <>
            <TextField
              fullWidth
              required
              multiline
              minRows={3}
              label="Internal review note"
              helperText="10–2,000 characters. Visible to authorized employees only."
              value={draft.note}
              disabled={disabled}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              slotProps={{ htmlInput: { maxLength: 2000 } }}
            />
            <TextField
              fullWidth
              required
              multiline
              minRows={3}
              label="Response for the requester"
              helperText="Shown on the request receipt. This action does not send an email."
              value={draft.message}
              disabled={disabled}
              onChange={(e) => setDraft({ ...draft, message: e.target.value })}
              slotProps={{ htmlInput: { maxLength: 2000 } }}
            />
            {draft.action === 'removed' && (
              <>
                <Alert severity="warning">
                  Record only a completed, verified removal. This command does not remove content or
                  revoke media access; the server checks the linked moderation decision.
                </Alert>
                <TextField
                  fullWidth
                  required
                  multiline
                  label="Access revocation verification"
                  helperText="20–2,000 characters."
                  value={draft.access}
                  disabled={disabled}
                  onChange={(e) => setDraft({ ...draft, access: e.target.value })}
                  slotProps={{ htmlInput: { maxLength: 2000 } }}
                />
                {item.request.detail === 'nonconsensual_intimate_images' && (
                  <TextField
                    fullWidth
                    required
                    multiline
                    label="Identical-copy review"
                    helperText="20–2,000 characters."
                    value={draft.copies}
                    disabled={disabled}
                    onChange={(e) => setDraft({ ...draft, copies: e.target.value })}
                    slotProps={{ htmlInput: { maxLength: 2000 } }}
                  />
                )}
              </>
            )}
          </>
        )}
      </Stack>
    </RecordSection>
  );
}
