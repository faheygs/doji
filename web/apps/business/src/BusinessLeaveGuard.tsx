import { useBlocker } from 'react-router-dom';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
export type BusinessFormState = { dirty: boolean; pending: boolean };
export function BusinessLeaveGuard({ dirty, pending }: BusinessFormState) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (dirty || pending) &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  return (
    <Dialog
      open={blocker.state === 'blocked'}
      onClose={() => blocker.reset?.()}
      aria-labelledby="business-leave-title"
    >
      <DialogTitle id="business-leave-title">
        {pending ? 'Your changes are still saving' : 'Leave without saving?'}
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          {pending
            ? 'Wait for the request to finish before leaving.'
            : 'Your unsaved changes will be lost.'}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={() => blocker.reset?.()}>
          Stay here
        </Button>
        <Button disabled={pending} onClick={() => blocker.proceed?.()}>
          Leave page
        </Button>
      </DialogActions>
    </Dialog>
  );
}
