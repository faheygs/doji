import {
  createBusinessApplicationClient,
  createApplicationController,
} from '../application-client.js';
import { applicationForm, businessStateLabel } from '../application-form.js';
import { createBusinessMfa } from '../business-mfa.js';
import { createBusinessVerification } from '../business-verification.js';
import { createBusinessRealtime, loadBusinessRealtimeSdk } from '../business-realtime.js';
const byId = (id) => document.getElementById(id);
const config = window.DOJI_BUSINESS_APPLICATION_CONFIG;
// No shipped enabled configuration, credentials, fake session or sample fallback.
if (config?.enabled === true) {
  let client, controller;
  const message = (value) => {
    byId('businessApplicationMessage').textContent = value;
  };
  const legalReady = Boolean(
    config.termsVersion &&
    config.privacyVersion &&
    /^https:\/\//.test(config.termsUrl || '') &&
    /^https:\/\//.test(config.privacyUrl || ''),
  );
  const setBusy = (busy) => {
    byId('businessApplicationForm')
      .querySelectorAll('button,input,select,textarea')
      .forEach((node) => {
        node.disabled = busy;
      });
    byId('applicationFields')
      .querySelectorAll('select')
      .forEach((select) => window.DojiPortalSelect.refresh(select));
  };
  function render(state) {
    const signedIn = client.hasSession();
    byId('applicationAccess').hidden = signedIn;
    byId('applicationWorkspace').hidden = !signedIn;
    byId('businessSignout').hidden = !signedIn;
    byId('businessWorkspaceActions').hidden = !signedIn || state.application?.state !== 'approved';
    if (!signedIn || state.application?.state !== 'approved') {
      byId('businessVerifiedWorkspace').hidden = true;
      byId('businessWorkspaceSummary').textContent = '';
    }
    if (!signedIn) {
      byId('applicationFields').replaceChildren();
      delete byId('applicationFields').dataset.signature;
      delete byId('businessTerms').dataset.revision;
      byId('businessTerms').checked = false;
      byId('businessPassword').value = '';
      message('');
      return;
    }
    const editable =
      state.loaded &&
      (!state.application || ['draft', 'changes_requested'].includes(state.application.state));
    byId('businessApplicationForm').hidden = !state.loaded;
    byId('businessApplicationForm').setAttribute('aria-busy', String(state.pending));
    byId('applicationReadStatus').textContent = state.loading
      ? state.loaded
        ? 'Checking application status…'
        : 'Loading your application…'
      : state.readError
        ? state.loaded
          ? 'Status could not be refreshed. Your last loaded application and any unsaved edits are still here. Use Refresh to try again.'
          : 'Your application could not be loaded. Use Refresh to try again before editing or submitting.'
        : state.lastCheckedAt
          ? `Last checked ${new Date(state.lastCheckedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}.`
          : '';
    // Preserve focus/input during in-flight status changes. Only replace fields
    // when the authoritative values change (or on first load).
    const signature = JSON.stringify([state.draftVersion, editable]);
    if (state.loaded && byId('applicationFields').dataset.signature !== signature) {
      byId('applicationFields').innerHTML = applicationForm(state.draft, !editable);
      byId('applicationFields').dataset.signature = signature;
      byId('applicationFields')
        .querySelectorAll('select')
        .forEach((select) => window.DojiPortalSelect.enhance(select, true));
    }
    byId('applicationState').textContent = state.loaded
      ? businessStateLabel(state.application?.state)
      : 'Application status unavailable';
    const revision = String(state.application?.revision ?? 'new');
    if (byId('businessTerms').dataset.revision !== revision) {
      byId('businessTerms').checked = false;
      byId('businessTerms').dataset.revision = revision;
    }
    byId('applicationResponse').textContent = state.application?.response || '';
    byId('applicationResponse').hidden = !state.application?.response;
    byId('applicationStale').hidden = !state.stale;
    byId('applicationActions').hidden = !editable;
    byId('applicationConsent').hidden = !editable || !legalReady;
    byId('applicationLegalGate').hidden = !editable || legalReady;
    setBusy(state.pending);
    byId('applicationSubmit').disabled =
      !state.loaded || state.pending || state.stale || !legalReady;
    byId('applicationSave').disabled = !state.loaded || state.pending || state.stale;
    byId('applicationRefresh').disabled = state.pending || state.loading;
    byId('applicationRefresh').textContent = state.loading ? 'Refreshing…' : 'Refresh';
    byId('applicationReload').disabled = state.pending || state.loading;
    message(state.pending ? 'Saving…' : state.error);
  }
  try {
    client = createBusinessApplicationClient(config);
    const verification = createBusinessVerification(byId('signinVerification'), config, 'signin');
    let signingIn = false;
    controller = createApplicationController(client, render);
    const realtime = createBusinessRealtime({
      client,
      enabled: config.realtimeEnabled === true,
      loadSdk: loadBusinessRealtimeSdk,
      reconcile: () => controller.reconcile(),
      status: (value) => {
        byId('businessRealtimeStatus').textContent = value;
        byId('businessRealtimeStatus').hidden = !value;
      },
    });
    client.onClear(() => {
      byId('businessRealtimeStatus').textContent = '';
      byId('businessRealtimeStatus').hidden = true;
      if (!signingIn) void verification.reset();
    });
    const loadWorkspace = async () => {
      const workspace = await client.workspace();
      byId('businessVerifiedWorkspace').hidden = false;
      byId('businessWorkspaceSummary').textContent =
        `${workspace.brand_name || 'Your business'} is approved. Your business session is protected with MFA.`;
      message('Business access verified.');
    };
    const mfa = createBusinessMfa(byId('businessWorkspaceMfa'), client, loadWorkspace, message);
    byId('businessOpenWorkspace').addEventListener('click', async (event) => {
      event.currentTarget.disabled = true;
      try {
        if (client.assurance() === 'aal2') await loadWorkspace();
        else await mfa.open();
      } catch (error) {
        message(error.message);
      } finally {
        byId('businessOpenWorkspace').disabled = false;
      }
    });
    byId('businessAccessForm').hidden = false;
    byId('businessAvailability').textContent =
      'Use your separate, verified business account. Your personal Doji account cannot sign in here.';
    if (legalReady) {
      byId('businessTermsLink').href = config.termsUrl;
      byId('businessPrivacyLink').href = config.privacyUrl;
    }
    byId('businessAccessForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (signingIn) return;
      let proof;
      try {
        proof = verification.fields();
      } catch (error) {
        message(error.message);
        return;
      }
      signingIn = true;
      const submit = event.submitter;
      submit.disabled = true;
      message('Signing in…');
      const password = byId('businessPassword').value;
      byId('businessPassword').value = '';
      try {
        await client.signin({ email: byId('businessEmail').value.trim(), password, ...proof });
        await controller.load();
        if (document.visibilityState === 'visible') void realtime.start();
      } catch (error) {
        message(error.message);
      } finally {
        submit.disabled = false;
        signingIn = false;
        if (client.hasSession()) verification.pause();
        else void verification.reset();
      }
    });
    byId('businessSignout').addEventListener('click', () => {
      void client
        .signout()
        .catch(() =>
          message(
            'This page is locked. Remote sign-out could not be confirmed; close this tab and contact support if needed.',
          ),
        );
    });
    byId('applicationFields').addEventListener('input', (event) => {
      if (event.target.name) controller.edit(event.target.name, event.target.value);
    });
    byId('applicationFields').addEventListener('change', (event) => {
      if (event.target.name) controller.edit(event.target.name, event.target.value);
    });
    byId('applicationSave').addEventListener('click', () => {
      void controller.command('save');
    });
    byId('businessApplicationForm').addEventListener('submit', (event) => {
      event.preventDefault();
      if (!legalReady || !byId('businessTerms').checked) {
        message('Accept the current terms and acknowledge the privacy notice before submitting.');
        byId('businessTerms').focus();
        return;
      }
      void controller.command('submit', config.termsVersion, config.privacyVersion);
    });
    byId('applicationRefresh').addEventListener('click', () => {
      void controller.load();
      void realtime.start();
    });
    byId('applicationReload').addEventListener('click', () => {
      if (
        !controller.snapshot().dirty ||
        window.confirm('Discard your unsaved draft and load the current application?')
      )
        void controller.load(true);
    });
    const reconcile = () => {
      if (document.visibilityState !== 'visible') {
        realtime.stop();
        return;
      }
      if (client.hasSession()) {
        void controller.reconcile();
        void realtime.start();
      }
    };
    document.addEventListener('visibilitychange', reconcile);
    window.addEventListener('online', reconcile);
    window.addEventListener('pagehide', () => {
      client.clear();
      verification.clear();
    });
    window.addEventListener('beforeunload', (event) => {
      if (controller.snapshot().dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  } catch (error) {
    message(error.message);
  }
}
