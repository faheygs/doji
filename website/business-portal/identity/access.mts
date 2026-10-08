import { createBusinessBrowserClient } from '../../../infra/portal-identity-candidate/business-browser-client.mts';
import { createBusinessVerification } from '../business-verification.mts';
import { identityConfig, control } from './config.mts';
import { openBusinessApplication } from './application.mts';
const message = (value: string) => {
  control('identityMessage').textContent = value;
};
try {
  const config = identityConfig();
  const client = createBusinessBrowserClient({ ...config, realm: 'business' });
  const params = new URLSearchParams(location.search);
  const signup = params.get('mode') !== 'signin' && params.get('signin') !== 'failed';
  const form = control<HTMLFormElement>('identityForm');
  const button = control<HTMLButtonElement>('identityContinue');
  const email = control<HTMLInputElement>('identityEmail');
  const terms = control<HTMLInputElement>('identityTerms'),
    privacy = control<HTMLInputElement>('identityPrivacy');
  control<HTMLAnchorElement>('identityTermsLink').href = config.termsUrl;
  control<HTMLAnchorElement>('identityPrivacyLink').href = config.privacyUrl;
  let verification: ReturnType<typeof createBusinessVerification> | undefined;
  let pending = false,
    leaving = false,
    handedOff = false;
  // Unknown session is not a signed-out state. Keep the static opening view
  // until restoration settles, including on slow connections and callback returns.
  const showAccess = () => {
    if (leaving) return;
    control('identityHeading').textContent = signup
      ? 'Create your business account.'
      : 'Welcome back.';
    control('identityIntro').textContent = signup
      ? 'Start with your email. Add your business details after setting up your account.'
      : 'Pick up where you left off, check your application status or open your approved business workspace.';
    document.title = signup ? 'Register · Doji for Business' : 'Sign in · Doji for Business';
    control('identitySigninPrompt').hidden = !signup;
    control('identityRegisterPrompt').hidden = signup;
    control('identityProgress').hidden = !signup;
    control('identityAgreements').hidden = !signup;
    terms.required = privacy.required = signup;
    control('identityExplanation').textContent = signup
      ? 'Next, create your password and verify your email securely. Then add your business details. No billing or campaigns are enabled by signing up.'
      : 'Continue to the secure business sign-in page. Choose Forgot password there if you need to reset your business password.';
    button.textContent = signup ? 'Continue' : 'Sign in';
    form.hidden = false;
    verification ??= createBusinessVerification(
      control('identityVerification'),
      { ...config, publicAdmission: true },
      signup ? 'register' : 'signin',
    );
  };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending || leaving || handedOff || form.hidden || !verification) return;
    email.value = email.value.trim();
    if (!form.reportValidity()) return;
    const loginHint = email.value;
    pending = true;
    button.disabled = true;
    try {
      const evidence = verification.fields();
      const proof =
        'verificationToken' in evidence && typeof evidence.verificationToken === 'string'
          ? evidence.verificationToken
          : '';
      message('Opening secure business sign-in…');
      const destination = await client.signin({
        signup,
        proof,
        ...(signup
          ? {
              termsAccepted: terms.checked,
              privacyAcknowledged: privacy.checked,
              country: 'US',
              termsVersion: config.termsVersion,
              privacyVersion: config.privacyVersion,
            }
          : {}),
      });
      // WorkOS-documented display hint only, not an identity or authorization claim.
      // The client already validates this exact provider URL and callback. Keep PKCE/state.
      const hosted = new URL(destination);
      hosted.searchParams.set('login_hint', loginHint);
      if (!leaving) window.location.assign(hosted.href);
    } catch (error) {
      message(error instanceof Error ? error.message : 'Business access could not be completed.');
      void verification.reset(signup ? 'register' : 'signin');
    } finally {
      pending = false;
      button.disabled = false;
    }
  });
  window.addEventListener('pagehide', () => {
    leaving = true;
    if (!handedOff) client.clear();
    verification?.clear();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && !handedOff) window.location.reload();
  });
  void client
    .restore()
    .then((signedIn) => {
      if (leaving) return;
      if (signedIn) {
        // Keep the verified session and document. No second restore, page reload,
        // browser storage or token serialization is involved in this UI handoff.
        history.replaceState(null, '', '/business-portal/application/');
        document.title = 'Your business · Doji';
        form.hidden = true;
        email.value = '';
        terms.checked = privacy.checked = false;
        verification?.clear();
        control('businessAccountAccess').hidden = true;
        control('businessMain').hidden = false;
        document
          .querySelector<HTMLAnchorElement>('.journeySkip')
          ?.setAttribute('href', '#businessMain');
        openBusinessApplication(client);
        handedOff = true;
        return;
      }
      showAccess();
      message(
        new URLSearchParams(location.search).get('signin') === 'failed'
          ? 'Sign-in was not completed. Please try again.'
          : '',
      );
    })
    .catch(() => {
      if (leaving) return;
      showAccess();
      message('Existing session could not be checked. You can try signing in again.');
    });
} catch (error) {
  control('identityHeading').textContent = 'Business access unavailable';
  control('identityIntro').textContent = 'Please try again later or contact support.';
  message(error instanceof Error ? error.message : 'Business access unavailable.');
}
