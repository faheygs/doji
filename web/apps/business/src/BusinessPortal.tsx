import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Link, Stack } from '@mui/material';
import { AccountCard } from '@doji/ui';
import { createBusinessBrowserClient } from '../../../../infra/portal-identity/business-browser-client.mts';
import {
  createApplicationController,
  type ApplicationSnapshot,
} from '../../../../website/business-portal/application-client.mts';
import { identityConfig } from '../../../../website/business-portal/identity/config.mts';
import { failureText, type Runtime } from './business-runtime';
import { Loading } from './BusinessLoading';
import { Access } from './BusinessAccess';
import { Application } from './BusinessApplication';
import { OwnedAccessConnected } from './OwnedAccessConnected';
import { businessAcceptance } from './business-acceptance';
import { BusinessLeaveGuard } from './BusinessLeaveGuard';
export function businessConnected() {
  return (
    window.DOJI_BUSINESS_IDENTITY_CONFIG?.enabled === true &&
    window.location.origin === 'https://business.dojipro.com'
  );
}

export function BusinessPortal() {
  const [params] = useSearchParams();
  const acceptance = businessAcceptance(
    window.DOJI_REACT_BUSINESS_CONFIG?.acceptanceUntil,
    params.get('mode'),
    Date.now(),
    window.DOJI_REACT_BUSINESS_CONFIG?.acceptanceExistingAccount,
  );
  const maintenance = window.DOJI_REACT_BUSINESS_CONFIG?.maintenanceEnabled === true;
  const queries = useQueryClient();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);
  const [runtime, setRuntime] = useState<Runtime>();
  const [state, setState] = useState<ApplicationSnapshot>();
  const [opening, setOpening] = useState(true);
  const [error, setError] = useState('');
  const [setupState, setSetupState] = useState({ dirty: false, pending: false });
  useEffect(() => {
    let disposed = false;
    let teardown = () => {};
    if (maintenance) return;
    try {
      if (!businessConnected())
        throw Error(
          'This preview does not connect to business accounts. Use the live business site to sign in.',
        );
      const config = identityConfig();
      const client = createBusinessBrowserClient({ ...config, realm: 'business' });
      const scope = ['business', crypto.randomUUID()];
      const controller = createApplicationController(
        {
          epoch: client.epoch,
          onClear: client.onClear,
          command: async (body) => {
            await queries.cancelQueries({ queryKey: scope });
            queries.removeQueries({ queryKey: scope });
            return client.command(body);
          },
          read: () =>
            queries.fetchQuery({
              queryKey: [...scope, client.epoch(), 'application'],
              queryFn: () => client.read(),
              staleTime: 0,
              gcTime: 0,
              retry: false,
            }),
        },
        (next) => {
          if (!disposed) setState(next);
        },
      );
      const unsubscribe = client.onClear(() => {
        queries.removeQueries({ queryKey: scope });
        if (!disposed) {
          setOpening(false);
          setError('');
        }
      });
      setRuntime({ client, controller, config });
      setState(controller.snapshot());
      const reconcile = () => {
        if (!disposed && document.visibilityState === 'visible' && client.hasSession())
          void controller.reconcile();
      };
      const leave = (event: BeforeUnloadEvent) => {
        if (controller.snapshot().dirty || controller.snapshot().pending) {
          event.preventDefault();
          event.returnValue = '';
        }
      };
      const hide = () => client.clear();
      const show = (event: PageTransitionEvent) => {
        if (event.persisted) window.location.reload();
      };
      document.addEventListener('visibilitychange', reconcile);
      window.addEventListener('online', reconcile);
      window.addEventListener('beforeunload', leave);
      window.addEventListener('pagehide', hide);
      window.addEventListener('pageshow', show);
      teardown = () => {
        unsubscribe();
        controller.destroy();
        client.clear();
        queries.removeQueries({ queryKey: scope });
        document.removeEventListener('visibilitychange', reconcile);
        window.removeEventListener('online', reconcile);
        window.removeEventListener('beforeunload', leave);
        window.removeEventListener('pagehide', hide);
        window.removeEventListener('pageshow', show);
      };
      void client
        .restore()
        .then(async (signedIn) => {
          if (disposed) return;
          if (signedIn) {
            navigateRef.current('/business-portal/application/', { replace: true });
            await controller.load();
          }
        })
        .catch((error) => {
          if (!disposed) setError(failureText(error));
        })
        .finally(() => {
          if (!disposed) setOpening(false);
        });
    } catch (error) {
      setError(failureText(error));
      setOpening(false);
    }
    return () => {
      disposed = true;
      teardown();
    };
  }, [queries, maintenance]);

  if (
    maintenance ||
    (!opening &&
      runtime &&
      !runtime.client.hasSession() &&
      acceptance.configured &&
      !acceptance.access)
  )
    return (
      <AccountCard
        title="Business access is temporarily paused"
        description="We’re updating business account access. Please return shortly. Your saved application is still there."
      >
        <Stack direction="row" sx={{ gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button href="/" variant="contained">
            Business home
          </Button>
          <Button href="mailto:support@dojipro.com">Contact support</Button>
        </Stack>
      </AccountCard>
    );
  if (opening) return <Loading />;
  if (!runtime)
    return (
      <Alert severity="info">
        {error}{' '}
        <Link href="https://business.dojipro.com/business-portal/access/?mode=signin">
          Open live business sign-in
        </Link>
      </Alert>
    );
  return (
    <Stack spacing={3} sx={{ py: 4 }}>
      {error && <Alert severity="error">{error}</Alert>}
      {runtime.client.hasSession() && state ? (
        <>
          <BusinessLeaveGuard
            dirty={state.dirty || setupState.dirty}
            pending={state.pending || setupState.pending}
          />
          <Stack direction="row" sx={{ justifyContent: 'flex-end', gap: 1 }}>
            <Button
              disabled={state.loading || state.pending || setupState.pending}
              onClick={() => void runtime.controller.load()}
            >
              Refresh status
            </Button>
            <Button
              disabled={state.pending || setupState.pending}
              onClick={() => {
                if (
                  (state.dirty || setupState.dirty) &&
                  !window.confirm('Sign out and discard unsaved changes?')
                )
                  return;
                void runtime.client.signout().catch((error) => setError(failureText(error)));
              }}
            >
              Sign out
            </Button>
          </Stack>
          <Application runtime={runtime} state={state} onSetupState={setSetupState} />
        </>
      ) : window.DOJI_REACT_BUSINESS_CONFIG?.ownedAuthEnabled === true ? (
        <OwnedAccessConnected
          runtime={runtime}
          onAuthenticated={async () => {
            if (!(await runtime.client.restore())) throw Error('Business session unavailable');
            navigateRef.current('/business-portal/application/', { replace: true });
            await runtime.controller.load();
          }}
        />
      ) : (
        <Access runtime={runtime} />
      )}
    </Stack>
  );
}
