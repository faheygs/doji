import { createBusinessBrowserClient } from '../../../infra/portal-identity-candidate/business-browser-client.mts';
import { createApplicationController, type ApplicationSnapshot } from '../application-client.mts';
import {
  applicationForm,
  applicationFormValues,
  businessStateLabel,
} from '../application-form.mts';
import { identityConfig, control } from './config.mts';
import { independentWorkspace } from './workspace.mts';
import { createBusinessJourney } from './journey.mts';
const message = (text: string) => {
  control('businessApplicationMessage').textContent = text;
  control('businessSignedOutMessage').textContent = text;
};
export function openBusinessApplication(
  restoredClient?: ReturnType<typeof createBusinessBrowserClient>,
) {
  try {
    const config = identityConfig();
    const client = restoredClient ?? createBusinessBrowserClient({ ...config, realm: 'business' });
    const workspace = independentWorkspace(client, message);
    const fields = control('applicationFields'),
      form = control<HTMLFormElement>('businessApplicationForm');
    const consent = control<HTMLInputElement>('businessTerms');
    const signout = control<HTMLButtonElement>('businessSignout');
    const journey = createBusinessJourney();
    let signature = '',
      revision = '',
      leaving = false;
    control<HTMLAnchorElement>('businessTermsLink').href = config.termsUrl;
    control<HTMLAnchorElement>('businessPrivacyLink').href = config.privacyUrl;
    function render(state: ApplicationSnapshot) {
      const signedIn = client.hasSession();
      workspace(state.loaded && state.application?.state === 'approved');
      control('applicationAccess').hidden = signedIn;
      control('applicationWorkspace').hidden = !signedIn;
      signout.hidden = !signedIn;
      control('businessSignedOutMessage').hidden = signedIn;
      journey.render(state, signedIn);
      if (!signedIn) {
        control('businessAccessHeading').textContent = 'Welcome to your business home.';
        control('businessAvailability').textContent =
          'Sign in to continue your application, check its status or open your approved business workspace.';
        control('applicationAccessActions').hidden = false;
        fields.replaceChildren();
        signature = revision = '';
        consent.checked = false;
        control('applicationResponse').textContent = '';
        message('');
        return;
      }
      const editable =
        state.loaded &&
        (!state.application ||
          ['draft', 'changes_requested'].includes(state.application.state || ''));
      form.hidden = !state.loaded;
      form.setAttribute('aria-busy', String(state.pending));
      const next = JSON.stringify([state.draftVersion, editable]);
      if (signature !== next && state.loaded) {
        fields.innerHTML = applicationForm(state.draft, !editable);
        signature = next;
        fields
          .querySelectorAll('select')
          .forEach((select) => window.DojiPortalSelect.enhance(select, true));
      }
      const current = String(state.application?.revision ?? 'new');
      if (current !== revision) {
        consent.checked = false;
        revision = current;
      }
      control('applicationState').textContent = state.loaded
        ? businessStateLabel(state.application?.state || '')
        : 'Loading application';
      control('applicationReadStatus').textContent = state.loading
        ? 'Checking application status…'
        : state.readError
          ? 'Could not refresh your application. Your draft is preserved. Use Refresh to try again.'
          : state.application?.state === 'approved'
            ? 'Your application is approved. Campaign publishing and billing remain disabled.'
            : state.lastCheckedAt
              ? 'Status checked ' +
                new Date(state.lastCheckedAt).toLocaleTimeString() +
                '. Use Refresh status for the latest update.'
              : '';
      control('applicationResponse').textContent = state.application?.response || '';
      control('applicationResponse').hidden = !state.application?.response;
      control('applicationStale').hidden = !state.stale;
      control('applicationActions').hidden = !editable;
      control('applicationConsent').hidden = !editable;
      form
        .querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement
        >('input,select,textarea,button')
        .forEach((element) => {
          element.disabled = state.pending || !editable;
        });
      fields
        .querySelectorAll('select')
        .forEach((select) => window.DojiPortalSelect.refresh(select));
      for (const id of ['applicationSave', 'applicationSubmit', 'applicationReview'])
        control<HTMLButtonElement>(id).disabled = !editable || state.pending || state.stale;
      for (const id of ['applicationRefresh', 'applicationReload'])
        control<HTMLButtonElement>(id).disabled = state.pending || state.loading;
      message(state.pending ? 'Saving your application. Please keep this page open…' : state.error);
    }
    const controller = createApplicationController(client, render);
    const edit = (event: Event) => {
      if (journey.isReviewing()) return;
      const target = event.target;
      if (
        (target instanceof HTMLInputElement ||
          target instanceof HTMLSelectElement ||
          target instanceof HTMLTextAreaElement) &&
        target.name
      ) {
        controller.edit(target.name, target.value);
        journey.edited();
      }
    };
    fields.addEventListener('input', edit);
    fields.addEventListener('change', edit);
    const syncForm = () => {
      for (const [key, value] of Object.entries(applicationFormValues(form)))
        controller.edit(key, value);
    };
    control('applicationSave').addEventListener('click', () => {
      syncForm();
      void command('save');
    });
    async function command(action: 'save' | 'submit') {
      const before = controller.snapshot().draftVersion;
      await controller.command(
        action,
        action === 'submit' ? config.termsVersion : undefined,
        action === 'submit' ? config.privacyVersion : undefined,
      );
      const after = controller.snapshot();
      if (!client.hasSession() || leaving) return;
      if (!after.error && !after.stale && after.draftVersion > before) journey.completed(action);
      else if (after.error) control('businessApplicationMessage').focus();
    }
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (controller.snapshot().pending || controller.snapshot().stale || !client.hasSession())
        return;
      if (!form.reportValidity()) return;
      syncForm();
      journey.review(controller.snapshot().draft);
    });
    control('applicationSubmit').addEventListener('click', () => {
      if (
        !journey.isReviewing() ||
        controller.snapshot().pending ||
        controller.snapshot().stale ||
        !client.hasSession()
      )
        return;
      if (!consent.checked) {
        message('Accept the terms and acknowledge the privacy notice before submitting.');
        consent.focus();
        return;
      }
      void command('submit');
    });
    control('applicationRefresh').addEventListener('click', () => {
      void controller.load();
    });
    control('applicationReload').addEventListener('click', () => {
      if (
        !controller.snapshot().dirty ||
        window.confirm('Discard your unsaved draft and load the current application?')
      )
        void controller.load(true);
    });
    signout.addEventListener('click', async () => {
      signout.disabled = true;
      try {
        await client.signout();
      } catch {
        message(
          'This page is locked. Remote sign-out could not be confirmed. Close this tab and contact support if needed.',
        );
      } finally {
        signout.disabled = false;
      }
    });
    const reconcile = () => {
      if (!leaving && document.visibilityState === 'visible' && client.hasSession())
        void controller.reconcile();
    };
    document.addEventListener('visibilitychange', reconcile);
    window.addEventListener('online', reconcile);
    window.addEventListener('pagehide', () => {
      leaving = true;
      client.clear();
    });
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) window.location.reload();
    });
    window.addEventListener('beforeunload', (event) => {
      if (controller.snapshot().dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
    // A handoff inside this document retains the exact verified in-memory client.
    // Direct entries still restore the HttpOnly business cookie through the server.
    if (restoredClient?.hasSession()) {
      void controller.load();
      return;
    }
    void client
      .restore()
      .then(async (signedIn) => {
        if (leaving) return;
        if (signedIn) await controller.load();
        else render(controller.snapshot());
      })
      .catch(() => {
        if (leaving) return;
        render(controller.snapshot());
        message('Business session could not be restored. Use account access to sign in again.');
      });
  } catch (error) {
    message(error instanceof Error ? error.message : 'Business application unavailable.');
  }
}
