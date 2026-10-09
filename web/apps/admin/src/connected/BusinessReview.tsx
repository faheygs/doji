import { useState, type ReactNode } from 'react';
import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { FormActions, RecordSection } from '@doji/ui';
import type { EmployeeSessionController, EmployeeOperator } from '@doji/portal-data/employee';
import type { BusinessRecord } from '@doji/portal-data/business-record';
import {
  businessDecisions,
  type BusinessDecisionAction,
} from '@doji/portal-data/business-decision';
import { useBusinessDecision } from './useBusinessDecision';
import { BusinessDecisionDialog } from './BusinessDecisionDialog';

export function BusinessReview({
  controller,
  data,
  operator,
  fetching,
  claimBusy,
  ownershipBlocked,
  refresh,
  children,
}: {
  controller: EmployeeSessionController;
  data: BusinessRecord;
  operator: EmployeeOperator;
  fetching: boolean;
  claimBusy: boolean;
  ownershipBlocked: boolean;
  refresh(): Promise<BusinessRecord | undefined>;
  children(disabled: boolean): ReactNode;
}) {
  const decision = useBusinessDecision(controller);
  const { application: item, owner } = data;
  const [action, setAction] = useState<BusinessDecisionAction | ''>('');
  const [response, setResponse] = useState('');
  const [note, setNote] = useState('');
  const [version, setVersion] = useState<string | null>(null);
  const currentVersion = item.revision + ':' + owner.revision;
  const stale = version !== null && version !== currentVersion;
  const manager = operator.capabilities.operator_manage === true;
  // Ownership coordinates pending reviews; the existing command remains the authority.
  const pendingReview =
    item.state === 'pending' && owner.can_decide && owner.assigned_to === operator.user_id;
  const terminal = ['approved', 'declined'].includes(item.state);
  const allowed = manager && (pendingReview || terminal);
  const choices: BusinessDecisionAction[] = pendingReview
    ? ['approve', 'request_changes', 'decline']
    : terminal
      ? ['reopen']
      : [];
  const locked =
    fetching ||
    claimBusy ||
    ownershipBlocked ||
    decision.busy ||
    decision.uncertain ||
    decision.blocked;
  const changed = () => setVersion((value) => value ?? currentVersion);
  const clearDraft = () => {
    setAction('');
    setResponse('');
    setNote('');
    setVersion(null);
  };
  async function reload() {
    if (decision.busy) return;
    const latest = await refresh();
    if (latest) {
      if (
        decision.uncertain &&
        decision.intent &&
        latest.application.revision <= decision.intent.p_revision
      ) {
        decision.stillUnconfirmed();
        return;
      }
      decision.reset();
      clearDraft();
    }
  }
  const inputValid =
    action &&
    choices.includes(action) &&
    [...response.trim()].length >= 8 &&
    [...note.trim()].length >= 8 &&
    response.trim().length <= 1000 &&
    note.trim().length <= 2000;
  const intent = decision.intent;
  const canConfirm =
    !fetching &&
    !claimBusy &&
    !ownershipBlocked &&
    !decision.busy &&
    !decision.blocked &&
    manager &&
    (decision.uncertain || (allowed && !stale && intent?.p_revision === item.revision));
  return (
    <>
      {decision.message && (
        <Alert
          severity={decision.uncertain || decision.blocked ? 'warning' : 'success'}
          sx={{ mt: 3 }}
        >
          {decision.message}
        </Alert>
      )}
      {allowed && (
        <Box
          component="form"
          id="business-decision"
          sx={{ mt: 3 }}
          onSubmit={(event) => {
            event.preventDefault();
            if (locked || stale || !inputValid || !action) return;
            decision.prepare({
              p_id: item.id,
              p_revision: item.revision,
              p_action: action,
              p_response: response.trim(),
              p_internal_note: note.trim(),
            });
          }}
        >
          <RecordSection title="Review decision">
            <Stack sx={{ gap: 3 }}>
              {stale && (
                <Alert severity="warning">
                  This record changed while you were reviewing it. Refresh before making a decision.
                </Alert>
              )}
              <TextField
                select
                required
                label="Decision"
                value={action}
                disabled={locked || stale}
                onChange={(event) => {
                  changed();
                  setAction(event.target.value as BusinessDecisionAction);
                }}
              >
                {choices.map((key) => (
                  <MenuItem value={key} key={key}>
                    {businessDecisions[key].label}
                  </MenuItem>
                ))}
              </TextField>
              {action && (
                <Typography color="text.secondary">{businessDecisions[action].effect}</Typography>
              )}
              <TextField
                required
                multiline
                minRows={3}
                label="Response to applicant"
                value={response}
                disabled={locked || stale}
                onChange={(event) => {
                  changed();
                  setResponse(event.target.value);
                }}
                slotProps={{ htmlInput: { minLength: 8, maxLength: 1000 } }}
                helperText="8–1,000 characters. Visible to the applicant; do not include private reviewer information."
              />
              <TextField
                required
                multiline
                minRows={3}
                label="Internal review note"
                value={note}
                disabled={locked || stale}
                onChange={(event) => {
                  changed();
                  setNote(event.target.value);
                }}
                slotProps={{ htmlInput: { minLength: 8, maxLength: 2000 } }}
                helperText="8–2,000 characters. Staff only; explain the evidence for this decision."
              />
            </Stack>
          </RecordSection>
        </Box>
      )}
      {manager && item.state === 'pending' && !pendingReview && (
        <Alert severity="info" sx={{ mt: 3 }}>
          {owner.assigned_to === null
            ? 'Assign this application to yourself before deciding.'
            : 'This application is assigned to another reviewer. Use Assignment to change its reviewer if you have permission.'}
        </Alert>
      )}
      <FormActions>
        <Button disabled={fetching || claimBusy || decision.busy} onClick={() => void reload()}>
          Refresh record
        </Button>
        {children(decision.busy || decision.uncertain || !!decision.intent)}
        {allowed && (
          <Button
            variant="contained"
            type="submit"
            form="business-decision"
            disabled={locked || stale || !inputValid}
          >
            Review decision
          </Button>
        )}
      </FormActions>
      <BusinessDecisionDialog
        decision={decision}
        brand={item.details.brand_name || 'Business application'}
        submission={item.submission}
        stale={stale}
        allowed={allowed}
        fetching={fetching}
        canConfirm={canConfirm}
        reload={reload}
        saved={clearDraft}
      />
    </>
  );
}
