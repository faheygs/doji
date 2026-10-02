// Public business forms only. No storage, polling, automatic retries or bypass.
let sdk;
function loadSdk() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!sdk)
    sdk = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        sdk = null;
        reject(new Error('Security check unavailable. Please retry.'));
      };
      const timer = setTimeout(fail, 12000);
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => {
        if (!window.turnstile) return fail();
        clearTimeout(timer);
        resolve(window.turnstile);
      };
      script.onerror = fail;
      document.head.append(script);
    });
  return sdk;
}

export function createBusinessVerification(root, config, initialAction) {
  if (config.publicAdmission !== true)
    return { fields: () => ({}), reset() {}, pause() {}, clear() {} };
  root.hidden = false;
  root.innerHTML =
    '<p>Security check</p><div data-business-challenge></div><p role="status" aria-live="polite" data-business-challenge-status></p><div class="applicationActions" hidden><button type="button" class="portalButton" data-business-challenge-retry>Retry security check</button></div>';
  const mount = root.querySelector('[data-business-challenge]');
  const status = root.querySelector('[data-business-challenge-status]');
  const retry = root.querySelector('[data-business-challenge-retry]');
  let widget,
    token = '',
    action = initialAction,
    generation = 0,
    disposed = false;
  const remove = () => {
    token = '';
    generation++;
    if (widget !== undefined) window.turnstile?.remove(widget);
    widget = undefined;
  };
  const reset = async (next = action) => {
    if (disposed) return;
    remove();
    action = next;
    const current = generation;
    retry.parentElement.hidden = true;
    status.textContent = 'Loading security check…';
    const failed = () => {
      if (current !== generation || disposed) return;
      token = '';
      status.textContent = 'Security check expired or unavailable. Please retry.';
      retry.parentElement.hidden = false;
    };
    try {
      if (!config.turnstileSiteKey) throw Error();
      const api = await loadSdk();
      if (current !== generation || disposed) return;
      widget = api.render(mount, {
        sitekey: config.turnstileSiteKey,
        action: `business_${action}`,
        size: 'flexible',
        theme: 'auto',
        retry: 'never',
        'refresh-expired': 'manual',
        'refresh-timeout': 'manual',
        'response-field': false,
        callback: (value) => {
          if (current !== generation || disposed) return;
          token = value;
          status.textContent = 'Security check complete.';
          retry.parentElement.hidden = true;
        },
        'error-callback': failed,
        'expired-callback': failed,
        'timeout-callback': failed,
      });
      if (!token) status.textContent = 'Complete the security check before continuing.';
    } catch {
      failed();
    }
  };
  retry.addEventListener('click', () => void reset());
  void reset();
  return {
    fields() {
      if (!token) throw new Error('Complete the security check before continuing.');
      // Taken once; reset after any submitted attempt, successful or otherwise.
      const value = token;
      token = '';
      return { verificationToken: value };
    },
    reset,
    pause: remove,
    clear() {
      disposed = true;
      remove();
    },
  };
}
