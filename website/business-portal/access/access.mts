import { createBusinessApplicationClient } from '../application-client.mts';
import { createBusinessMfa } from '../business-mfa.mts';
import { createBusinessVerification } from '../business-verification.mts';
type Controls = Record<
  | 'accessHeading'
  | 'accessAvailability'
  | 'accessContent'
  | 'accountLegalNotice'
  | 'accountActionMount'
  | 'accountNameField'
  | 'accountPasswordField'
  | 'accountAgreements'
  | 'accountVerification'
  | 'linkConfirmation'
  | 'accessMfa'
  | 'accessResume'
  | 'accessMessage',
  HTMLElement
> &
  Record<
    | 'accountName'
    | 'accountEmail'
    | 'accountPassword'
    | 'accountTerms'
    | 'accountPrivacy'
    | 'replacementPassword'
    | 'repeatPassword',
    HTMLInputElement
  > &
  Record<'accountSubmit' | 'verifyLink' | 'resumeVerification', HTMLButtonElement> &
  Record<'accountTermsLink' | 'accountPrivacyLink', HTMLAnchorElement> &
  Record<'accountForm' | 'passwordForm', HTMLFormElement> & { accountAction: HTMLSelectElement };
function el<K extends keyof Controls>(id: K): Controls[K] {
  const node = document.querySelector<Controls[K]>(`#${id}`);
  if (!node) throw Error(`Missing business access control: ${id}`);
  return node;
}
// Read once, remove immediately, never persist/log a one-time capability.
const fragment = new URLSearchParams(location.hash.slice(1));
let ticket = fragment.get('ticket');
fragment.delete('ticket');
if (location.hash) history.replaceState(null, '', location.pathname);
const config = window.DOJI_BUSINESS_APPLICATION_CONFIG;
if (config?.enabled === true) {
  const message = (text: unknown) => {
    el('accessMessage').textContent = typeof text === 'string' ? text : '';
  };
  try {
    const client = createBusinessApplicationClient(config);
    // Signed email links are already authenticated capabilities; opening one
    // must not load a third-party challenge or consume the link automatically.
    const verification = ticket
      ? { fields: () => ({}), reset(_action?: string) {}, clear() {} }
      : createBusinessVerification(el('accountVerification'), config, 'register');
    let busy = false;
    const passwordReady = () => {
      el('passwordForm').hidden = false;
      el('replacementPassword').focus();
      message('Choose a new business password.');
    };
    const mfa = createBusinessMfa(
      el('accessMfa'),
      client,
      passwordReady,
      (text) => {
        message(text);
        if (client.hasSession() && el('accessMfa').hidden) el('accessResume').hidden = false;
      },
      () => {
        el('accessResume').hidden = false;
        message('Verification paused. Resume to finish resetting your password.');
      },
    );
    const prepareRecovery = async () => {
      el('accessResume').hidden = true;
      if (!(await mfa.open({ enroll: false }))) passwordReady();
    };
    el('resumeVerification').addEventListener('click', () => {
      void prepareRecovery().catch((error) =>
        message(error instanceof Error ? error.message : String(error)),
      );
    });
    client.onClear(() => {
      el('passwordForm').hidden = true;
      el('accessResume').hidden = true;
      for (const id of ['accountPassword', 'replacementPassword', 'repeatPassword'] as const)
        el(id).value = '';
    });
    el('accessAvailability').textContent =
      config.publicAdmission === true
        ? 'United States businesses: create an account, verify your email, then submit your business for review.'
        : 'Available only to invited businesses during the pilot.';
    el('accessContent').hidden = false;
    const legalReady =
      /^https:\/\//.test(config.termsUrl || '') &&
      /^https:\/\//.test(config.privacyUrl || '') &&
      /^[A-Za-z0-9._-]{1,100}$/.test(config.termsVersion || '') &&
      /^[A-Za-z0-9._-]{1,100}$/.test(config.privacyVersion || '');
    if (legalReady) {
      el('accountTermsLink').href = config.termsUrl || '';
      el('accountPrivacyLink').href = config.privacyUrl || '';
      el('accountLegalNotice').hidden = false;
    }
    el('accountForm').hidden = Boolean(ticket);
    el('linkConfirmation').hidden = !ticket;
    if (ticket) el('accessHeading').textContent = 'Verify business access';
    // Mount after the shared shell's legacy enhancement pass, so this form uses
    // the shared component's keyboard/ARIA-enabled mode from its first render.
    el('accountActionMount').innerHTML =
      '<label for="accountAction">What would you like to do?</label><select id="accountAction"><option value="register">Create an account</option><option value="resend">Resend verification email</option><option value="recover">Reset password</option></select>';
    const action = el('accountAction');
    const changeAction = () => {
      const registering = action.value === 'register';
      for (const id of ['accountName', 'accountPassword'] as const) {
        el(id).required = registering;
        el(id).disabled = !registering;
      }
      el('accountNameField').hidden = el('accountPasswordField').hidden = !registering;
      el('accountPassword').value = '';
      el('accountAgreements').hidden = !registering;
      for (const id of ['accountTerms', 'accountPrivacy'] as const) {
        el(id).checked = false;
        el(id).required = registering;
        el(id).disabled = !registering;
      }
      el('accountSubmit').textContent = registering ? 'Create account' : 'Send email';
      el('accessHeading').textContent = registering
        ? 'Create your business account'
        : action.value === 'recover'
          ? 'Reset your business password'
          : 'Verify your business email';
      message('');
      void verification.reset(action.value);
    };
    action.addEventListener('change', changeAction);
    window.DojiPortalSelect.enhance(action, true);
    el('accountForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy) return;
      if (
        action.value === 'register' &&
        (!legalReady || !el('accountTerms').checked || !el('accountPrivacy').checked)
      ) {
        message(
          'Review the current business documents, accept the terms and acknowledge the privacy notice. If links are unavailable, registration is closed.',
        );
        return;
      }
      let proof;
      try {
        proof = verification.fields();
      } catch (error) {
        message(error instanceof Error ? error.message : String(error));
        return;
      }
      busy = true;
      const fields = { email: el('accountEmail').value.trim(), ...proof };
      const selected = action.value;
      if (selected === 'register')
        Object.assign(fields, {
          displayName: el('accountName').value.trim(),
          password: el('accountPassword').value,
          termsAccepted: el('accountTerms').checked,
          privacyAcknowledged: el('accountPrivacy').checked,
          termsVersion: config.termsVersion,
          privacyVersion: config.privacyVersion,
          country: 'US',
        });
      el('accountPassword').value = '';
      el('accountSubmit').disabled = true;
      message('Processing your request…');
      try {
        const result = await client.auth(selected, fields);
        message(
          result && typeof result === 'object' && 'message' in result ? result.message : undefined,
        );
      } catch (error) {
        message(error instanceof Error ? error.message : String(error));
      } finally {
        busy = false;
        el('accountSubmit').disabled = false;
        void verification.reset(action.value);
      }
    });
    el('verifyLink').addEventListener('click', async () => {
      if (busy || !ticket) return;
      busy = true;
      el('verifyLink').disabled = true;
      message('Verifying your business link…');
      try {
        const kind = await client.verifyLink(ticket);
        ticket = null;
        el('linkConfirmation').hidden = true;
        if (kind === 'signup') {
          await client.signout();
          message(
            'Your business email is verified. Return to sign in and complete your application.',
          );
        } else await prepareRecovery();
      } catch (error) {
        message(error instanceof Error ? error.message : String(error));
      } finally {
        busy = false;
        el('verifyLink').disabled = false;
      }
    });
    el('passwordForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy) return;
      const password = el('replacementPassword').value;
      if (password !== el('repeatPassword').value) {
        message('The passwords must match.');
        return;
      }
      const submit = event.submitter;
      if (!(submit instanceof HTMLButtonElement || submit instanceof HTMLInputElement)) return;
      busy = true;
      submit.disabled = true;
      el('replacementPassword').value = el('repeatPassword').value = '';
      let saved = false;
      try {
        await client.resetPassword(password);
        saved = true;
        await client.signout();
        message('Password saved. Return to sign in with your new business password.');
      } catch (error) {
        message(
          saved
            ? 'Password saved and this page is locked. Remote sign-out could not be confirmed; close this tab.'
            : error instanceof Error
              ? error.message
              : String(error),
        );
      } finally {
        busy = false;
        submit.disabled = false;
      }
    });
    window.addEventListener('pagehide', () => {
      ticket = null;
      client.clear();
      mfa.clear();
      verification.clear();
    });
  } catch (error) {
    message(error instanceof Error ? error.message : String(error));
  }
}
