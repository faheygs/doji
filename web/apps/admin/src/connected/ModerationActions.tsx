import { useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Stack,
  Typography,
} from '@mui/material';
import { FormActions, RecordSection } from '@doji/ui';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import type { ModerationRecord } from '@doji/portal-data/moderation-record';
import { validModerationInput, type ModerationInput } from '@doji/portal-data/moderation-command';
import {
  caseFingerprint,
  draftCommand,
  initialDraft,
  ModerationFields,
  actionChoices,
} from './ModerationFields';
import type { useModerationCommand } from './useModerationCommand';
import { ModerationOwnership } from './ModerationOwnership';

export function ModerationActions({
  controller,
  item,
  fetching,
  refresh,
  command,
}: {
  controller: EmployeeSessionController;
  item: ModerationRecord;
  fetching: boolean;
  refresh: () => Promise<ModerationRecord | undefined>;
  command: ReturnType<typeof useModerationCommand>;
}) {
  const [draft, setDraft] = useState(() => initialDraft(item));
  const [confirm, setConfirm] = useState<Omit<ModerationInput, 'key'> | null>(null);
  const [override, setOverride] = useState(false);
  const [ownershipBusy, setOwnershipBusy] = useState(false);
  const actor = controller.getSnapshot().operator!,
    caps = actor.capabilities;
  const assigned = item.owner ? item.owner.assigned_to : item.report.assignedTo;
  const mine = assigned === actor.user_id;
  const open = (item.appeal?.appeal.status ?? item.report.summary.status) === 'pending';
  const writable =
    !!caps.moderation_write &&
    (!item.restricted || (!!caps.legal_read && !!caps.restricted_review));
  const eligible = !item.appeal || (item.appeal.canReview && item.owner?.can_decide === true);
  const stale = draft.fingerprint !== caseFingerprint(item);
  const locked =
    command.busy || command.uncertain || command.blocked || fetching || stale || ownershipBusy;
  const input = draftCommand(item, draft),
    valid = validModerationInput({ ...input, key: item.report.id });
  const apply = async (next?: Omit<ModerationInput, 'key'>) => {
    if (await command.submit(next)) {
      setConfirm(null);
      setOverride(false);
    }
  };
  const reload = async () => {
    const next = await refresh();
    if (next && command.refreshed()) {
      setDraft(initialDraft(next));
      setConfirm(null);
      setOverride(false);
    }
  };
  return (
    <>
      {stale && (
        <Alert severity="warning">The case changed. Refresh before preparing another action.</Alert>
      )}
      {!writable ? (
        <Alert severity="info">You have read-only access to this case.</Alert>
      ) : (
        <>
          {assigned && !mine && (
            <Alert severity="info">This case is assigned to another employee.</Alert>
          )}
          {(mine || !open) && eligible && actionChoices(item).length > 0 && (
            <RecordSection title="Case action">
              <ModerationFields
                item={item}
                draft={draft}
                change={setDraft}
                disabled={locked || !!confirm}
              />
            </RecordSection>
          )}
          <FormActions>
            <Button
              disabled={command.busy || fetching || ownershipBusy}
              onClick={() => void reload()}
            >
              Refresh case
            </Button>
            <ModerationOwnership
              controller={controller}
              item={item}
              disabled={locked || !!confirm}
              refresh={refresh}
              command={command}
              onBusy={setOwnershipBusy}
            />
            {!command.uncertain && eligible && (mine || !open) && (
              <Button
                variant="contained"
                disabled={locked || !valid || !!confirm}
                onClick={() => setConfirm(input)}
              >
                Review outcome
              </Button>
            )}
          </FormActions>
        </>
      )}
      <Dialog
        open={!!confirm && !command.uncertain}
        onClose={() => {
          if (!command.busy && !command.uncertain) setConfirm(null);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Confirm {confirm?.action.replaceAll('_', ' ')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirm?.kind === 'review'
              ? 'Changes review status only; existing enforcement and member notices stay unchanged.'
              : confirm?.kind === 'triage'
                ? 'Changes assignment or priority only; it does not remove content.'
                : 'This is an audited moderation action. Content visibility, account access and member notices may change as described below.'}
          </DialogContentText>
          <Stack sx={{ gap: 2, mt: 2 }}>
            {confirm &&
              Object.entries(confirm)
                .filter(
                  ([key, value]) =>
                    [
                      'policy',
                      'severity',
                      'account',
                      'days',
                      'reason',
                      'notice',
                      'priority',
                    ].includes(key) &&
                    value !== null &&
                    value !== undefined,
                )
                .map(([key, value]) => (
                  <Typography key={key} sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {key}: {String(value)}
                  </Typography>
                ))}
            {item.appeal?.overrideRequired && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={override}
                    disabled={command.busy || command.uncertain}
                    onChange={(e) => setOverride(e.target.checked)}
                  />
                }
                label="I understand this uses the audited super-admin override of independent review."
              />
            )}
            {(command.message || stale) && (
              <Alert severity="warning">
                {command.message || 'The case changed. Refresh before confirming.'}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={command.busy || command.uncertain} onClick={() => setConfirm(null)}>
            Back
          </Button>
          <Button
            variant="contained"
            disabled={
              command.busy ||
              fetching ||
              command.blocked ||
              (!command.uncertain && stale) ||
              !writable ||
              (!!item.appeal?.overrideRequired && !override)
            }
            onClick={() => confirm && void apply(confirm)}
          >
            {command.uncertain ? 'Retry same action' : 'Confirm outcome'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
