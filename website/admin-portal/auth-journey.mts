// Presentation only: the existing employee transport owns authentication and MFA.
type AdminAuthPhase = 'credentials' | 'challenge' | 'enrollment' | 'restoring' | 'locked';
declare global {
  interface Window {
    DojiAdminJourney?: {
      phase(step: string, focus?: boolean): void;
      busy(form: HTMLFormElement, label: string): () => void;
      clearSecrets(): void;
    };
  }
}
(() => {
  if (document.body.dataset.portal !== 'admin') return;
  const root = document.getElementById('portalAuth');
  const heading = document.getElementById('adminAuthTitle');
  const description = document.getElementById('adminAuthDescription');
  if (!root || !heading || !description) return;
  const copy: Record<AdminAuthPhase, [string, string, number]> = {
    credentials: ['Admin sign in', 'Use your employee account to continue to Doji Operations.', 0],
    challenge: [
      'Verify it’s you',
      'One more step. Enter the current code from your authenticator app.',
      1,
    ],
    enrollment: [
      'Secure your employee account',
      'Set up an authenticator once, then verify your code to continue.',
      1,
    ],
    restoring: ['Opening admin workspace', 'Checking your protected employee session…', 2],
    locked: [
      'Workspace locked',
      'Sign in and verify your authenticator to return. Unsaved sensitive drafts were cleared for security.',
      0,
    ],
  };
  const password = document.querySelector<HTMLInputElement>('#adminPassword');
  const reveal = document.querySelector<HTMLButtonElement>('#adminPasswordToggle');
  const hidePassword = () => {
    if (password) password.type = 'password';
    if (reveal) {
      reveal.textContent = 'Show';
      reveal.setAttribute('aria-label', 'Show password');
      reveal.setAttribute('aria-pressed', 'false');
    }
  };
  reveal?.addEventListener('click', () => {
    if (!password) return;
    if (password.type === 'text') hidePassword();
    else {
      password.type = 'text';
      reveal.textContent = 'Hide';
      reveal.setAttribute('aria-label', 'Hide password');
      reveal.setAttribute('aria-pressed', 'true');
    }
  });
  function clearSecrets() {
    root!
      .querySelectorAll<HTMLInputElement>(
        'input[type="password"], #adminPassword, [autocomplete="one-time-code"]',
      )
      .forEach((input) => {
        input.value = '';
      });
    document.getElementById('adminTotpQr')?.removeAttribute('src');
    const secret = document.getElementById('adminTotpSecret');
    if (secret) secret.textContent = '';
    hidePassword();
  }
  function phase(step: string, focus = false) {
    if (!Object.hasOwn(copy, step)) return;
    const [title, text, index] = copy[step as AdminAuthPhase];
    heading!.textContent = title;
    description!.textContent = text;
    root!.dataset.authPhase = step;
    root!.querySelectorAll<HTMLElement>('[data-auth-step]').forEach((item, position) => {
      item.classList.toggle('complete', position < index);
      if (position === index) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    if (step === 'credentials' || step === 'locked') clearSecrets();
    if (focus) heading!.focus({ preventScroll: true });
  }
  function busy(form: HTMLFormElement, label: string) {
    const controls = [
      ...form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button'),
    ];
    const previous = controls.map((control) => control.disabled);
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const oldLabel = submit?.textContent || '';
    form.setAttribute('aria-busy', 'true');
    controls.forEach((control) => {
      control.disabled = true;
    });
    if (submit) submit.textContent = label;
    return () => {
      controls.forEach((control, index) => {
        control.disabled = previous[index] ?? false;
      });
      if (submit) submit.textContent = oldLabel;
      form.removeAttribute('aria-busy');
    };
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hidePassword();
  });
  window.DojiAdminJourney = Object.freeze({ phase, busy, clearSecrets });
})();
