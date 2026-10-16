import {
  StrictMode,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { QueryClientProvider } from '@tanstack/react-query';
import { DojiTheme } from '@doji/ui/theme';
import { createEmployeeSession, type EmployeeSessionController } from '@doji/portal-data/employee';
import { attachEmployeeReconciliation } from '../src/connected/employee-reconciliation';
import { WorkspaceLoadBoundary } from '../src/connected/WorkspaceLoadBoundary';
import { StagingEnvironment } from '../src/connected/StagingEnvironment';
import { developmentRequest, developmentTransport } from './development-transport';
import { localAdminOrigin, localStagingFlags } from './transport';

const Workspace = lazy(() =>
  import('../src/connected/ConnectedWorkspace').then((m) => ({ default: m.EmployeeWorkspace })),
);
type Catalog = {
  developer: string;
  csrf: string;
  selected: string | null;
  personas: { id: string; label: string }[];
};
function catalog(value: unknown): Catalog {
  const result = value as Catalog | null;
  if (
    !result ||
    typeof result.developer !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(result.csrf) ||
    !Array.isArray(result.personas) ||
    result.personas.length > 100 ||
    !result.personas.every((p) => typeof p.id === 'string' && typeof p.label === 'string')
  )
    throw Error('Staging employee list unavailable.');
  return result;
}
function ActiveWorkspace({
  controller,
  choose,
}: {
  controller: EmployeeSessionController;
  choose(): void;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(() => {
    void controller.restore();
    return attachEmployeeReconciliation(controller);
  }, [controller]);
  if (state.phase !== 'ready' || !state.cache)
    return (
      <Box sx={{ p: 3 }}>
        {state.busy || state.phase === 'restoring' ? (
          <CircularProgress aria-label="Loading staging persona" />
        ) : (
          <Stack spacing={2}>
            <Alert severity="warning">{state.message || 'Your local session ended.'}</Alert>
            <Button onClick={choose}>Impersonate user</Button>
          </Stack>
        )}
      </Box>
    );
  return (
    <QueryClientProvider client={state.cache}>
      <WorkspaceLoadBoundary>
        <Suspense fallback={<CircularProgress aria-label="Loading workspace" />}>
          <Workspace
            controller={controller}
            realtimeEnabled={false}
            accountAction={{ label: 'Impersonate user', onClick: choose }}
          />
        </Suspense>
      </WorkspaceLoadBoundary>
    </QueryClientProvider>
  );
}
function DevelopmentApp() {
  const [list, setList] = useState<Catalog | null>(null);
  const [selected, setSelected] = useState('');
  const [controller, setController] = useState<EmployeeSessionController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const loading = useRef(false);
  async function load() {
    if (loading.current) return;
    loading.current = true;
    setBusy(true);
    setError('');
    try {
      const next = catalog(await developmentRequest('personas'));
      setList(next);
      if (next.selected && next.personas.some((p) => p.id === next.selected)) {
        setSelected(next.selected);
        setController(
          createEmployeeSession(localStagingFlags, {}, developmentTransport(next.csrf)),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Staging unavailable.');
    } finally {
      setBusy(false);
      loading.current = false;
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function choose() {
    if (busy) return;
    setError('');
    setSelected(controller?.getSnapshot().operator?.user_id ?? '');
    setDialogOpen(true);
    setList(null);
    setBusy(true);
    try {
      setList(catalog(await developmentRequest('personas')));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Employee directory unavailable.');
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    if (!list || !selected || busy) return;
    setBusy(true);
    setError('');
    try {
      if (controller) {
        await controller.signOut();
        if (controller.getSnapshot().phase === 'cleanup-error')
          throw Error('Could not end the previous session. Try again before switching users.');
        setController(null);
      }
      const current = catalog(await developmentRequest('personas'));
      const result = (await developmentRequest('select', current.csrf, { persona: selected })) as {
        csrf?: string;
      };
      if (!result.csrf || !/^[A-Za-z0-9_-]{43}$/.test(result.csrf))
        throw Error('Persona selection unavailable.');
      // A full document navigation also removes record drafts and the previous user's route.
      location.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Staging unavailable.');
      if (controller?.getSnapshot().phase !== 'cleanup-error') setList(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <StagingEnvironment>
      {controller ? <ActiveWorkspace controller={controller} choose={choose} /> : null}
      <Dialog
        open={dialogOpen || !controller}
        fullWidth
        maxWidth="sm"
        onClose={() => {
          if (!busy && controller) setDialogOpen(false);
        }}
        aria-labelledby="impersonate-title"
        aria-describedby="impersonate-description"
      >
        <DialogTitle id="impersonate-title">Impersonate user</DialogTitle>
        <DialogContent>
          <Stack spacing={3}>
            <DialogContentText id="impersonate-description">
              Select an active staging employee. Switching reloads the portal and discards unsaved
              changes.
            </DialogContentText>
            {error && <Alert severity="error">{error}</Alert>}
            {list ? (
              <>
                <TextField
                  select
                  label="User"
                  value={selected}
                  disabled={busy}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {list.personas.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.label}
                    </MenuItem>
                  ))}
                </TextField>
                {!list.personas.length && (
                  <Alert severity="info">
                    No active staging employees are available to your developer credential.
                  </Alert>
                )}
              </>
            ) : (
              <Button disabled={busy} onClick={() => void load()}>
                {busy ? 'Connecting…' : 'Retry connection'}
              </Button>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          {controller && (
            <Button disabled={busy} onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
          )}
          <Button
            variant="contained"
            disabled={busy || !list?.personas.some((p) => p.id === selected)}
            onClick={() => void start()}
          >
            Impersonate User
          </Button>
        </DialogActions>
      </Dialog>
    </StagingEnvironment>
  );
}

if (
  !import.meta.env.DEV ||
  import.meta.env.MODE !== 'staging-local' ||
  location.origin !== localAdminOrigin
)
  throw Error('Development personas are only available on the fixed loopback server.');
const root = document.getElementById('root');
if (!root) throw Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <DojiTheme mode="dark" desktopWorkspace>
      <DevelopmentApp />
    </DojiTheme>
  </StrictMode>,
);
