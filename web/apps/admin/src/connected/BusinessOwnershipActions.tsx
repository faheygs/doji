import { useRef, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import type { BusinessRecord } from '@doji/portal-data/business-record';
import type { useBusinessClaim } from './useBusinessClaim';
import { BusinessAssigneePicker } from './BusinessAssigneePicker';

export function BusinessOwnershipActions({
  controller,
  data,
  claim,
  disabled,
  refresh,
}: {
  controller: EmployeeSessionController;
  data: BusinessRecord;
  claim: ReturnType<typeof useBusinessClaim>;
  disabled: boolean;
  refresh(): Promise<BusinessRecord | undefined>;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<{ action: 'assign' | 'release'; version: string } | null>(
    null,
  );
  const [selected, setSelected] = useState('');
  const cancel = useRef<HTMLButtonElement>(null);
  const version = data.owner.revision + ':' + data.owner.source_version;
  const stale = !!dialog && dialog.version !== version;
  const manager = controller.getSnapshot().operator?.capabilities.operator_manage === true;
  const canAssign = data.owner.can_assign && manager;
  const allowed = dialog?.action === 'assign' ? canAssign : data.owner.can_release;
  const locked = disabled || claim.busy || claim.blocked;
  const open = (action: 'assign' | 'release') => {
    setAnchor(null);
    setSelected('');
    setDialog({ action, version });
  };
  async function apply() {
    if (!dialog || locked || (!claim.uncertain && (stale || !allowed))) return;
    if (await claim.submit(data, dialog.action, selected || null)) setDialog(null);
  }
  return (
    <>
      {(data.owner.can_claim || (claim.uncertain && !dialog)) && (
        <Button variant="contained" disabled={locked} onClick={() => void claim.submit(data)}>
          {claim.busy ? 'Assigning…' : claim.uncertain ? 'Retry same assignment' : 'Assign to me'}
        </Button>
      )}
      {(canAssign || data.owner.can_release) && !claim.uncertain && (
        <Button
          disabled={locked}
          aria-haspopup="menu"
          aria-expanded={!!anchor}
          aria-controls={anchor ? 'business-assignment-menu' : undefined}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          Assignment
        </Button>
      )}
      <Menu
        id="business-assignment-menu"
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
      >
        {canAssign && <MenuItem onClick={() => open('assign')}>Change assignee</MenuItem>}
        {data.owner.can_release && (
          <MenuItem onClick={() => open('release')}>Release assignment</MenuItem>
        )}
      </Menu>
      <Dialog
        open={!!dialog}
        fullWidth
        maxWidth="sm"
        aria-labelledby="assignment-title"
        slotProps={{ transition: { onEntered: () => cancel.current?.focus() } }}
        onClose={() => {
          if (!claim.busy && !claim.uncertain) setDialog(null);
        }}
      >
        <DialogTitle id="assignment-title">
          {dialog?.action === 'assign' ? 'Change assignee' : 'Release assignment'}
        </DialogTitle>
        <DialogContent>
          <Stack sx={{ gap: 2, pt: 1 }}>
            <Typography>
              {data.application.details.brand_name || 'Business application'} · Current assignee:{' '}
              {data.owner.owner_label}
            </Typography>
            <Typography color="text.secondary">
              {dialog?.action === 'assign'
                ? 'Select an eligible employee for this application.'
                : 'Returns this application to the unassigned queue. Its review status will not change.'}
            </Typography>
            {dialog?.action === 'assign' && (
              <BusinessAssigneePicker
                controller={controller}
                id={data.application.id}
                owner={data.owner.assigned_to}
                disabled={locked || stale || claim.uncertain}
                selected={selected}
                select={setSelected}
              />
            )}
            {(stale || !allowed) && !claim.uncertain && (
              <Alert severity="warning">
                Ownership or permissions changed. Close and refresh before continuing.
              </Alert>
            )}
            {claim.message && <Alert severity="warning">{claim.message}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          {claim.uncertain ? (
            <Button
              disabled={claim.busy || disabled}
              onClick={() =>
                void refresh().then((latest) => {
                  if (
                    latest &&
                    (latest.owner.revision > data.owner.revision ||
                      latest.owner.source_version !== data.owner.source_version)
                  )
                    setDialog(null);
                })
              }
            >
              Refresh ownership
            </Button>
          ) : (
            <Button ref={cancel} disabled={claim.busy} onClick={() => setDialog(null)}>
              Cancel
            </Button>
          )}
          <Button
            variant="contained"
            disabled={
              locked ||
              (!claim.uncertain &&
                (stale ||
                  !allowed ||
                  (dialog?.action === 'assign' &&
                    (!selected || selected === data.owner.assigned_to))))
            }
            onClick={() => void apply()}
          >
            {claim.busy
              ? 'Saving…'
              : claim.uncertain
                ? 'Retry same assignment'
                : dialog?.action === 'assign'
                  ? 'Assign reviewer'
                  : 'Release assignment'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
