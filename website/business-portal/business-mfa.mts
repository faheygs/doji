// Shared business-only TOTP presentation. No storage, phone factors or polling.
export interface BusinessFactor {
  id: string;
  status?: string;
  totp?: { secret?: string; qr_code?: string };
}
export interface BusinessMfaClient {
  onClear(clear: () => void): () => void;
  epoch(): number;
  verifyFactor(id: string, code: string): Promise<unknown>;
  factors(): Promise<BusinessFactor[]>;
  enroll(): Promise<BusinessFactor>;
}
export function createBusinessMfa(
  root: HTMLElement,
  client: BusinessMfaClient,
  onVerified: () => unknown | Promise<unknown>,
  onError: (message: string) => void,
  onCancel = () => {},
) {
  let factor: BusinessFactor | null | undefined = null,
    generation = 0,
    busy = false;
  root.innerHTML = `<section class="authHint"><h2>Secure business access</h2>
    <p data-mfa-copy>Use an authenticator app to protect this business account.</p>
    <div data-mfa-setup hidden><img class="businessMfaQr" alt="Scan with your authenticator app" />
      <p>Or enter this setup key in your authenticator:</p><code data-mfa-secret></code></div>
    <form class="authForm"><div class="field"><label for="businessMfaCode">Authenticator code</label>
      <input id="businessMfaCode" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" required /></div>
      <div class="applicationActions"><button class="portalButton" type="button" data-mfa-cancel>Cancel</button>
      <button class="portalButton primary" type="submit">Verify authenticator</button></div></form>
    <p>Lost your authenticator? Contact support. A password reset does not remove MFA.</p></section>`;
  function element<T extends HTMLElement>(selector: string): T {
    const node = root.querySelector<T>(selector);
    if (!node) throw Error(`Missing business MFA control: ${selector}`);
    return node;
  }
  const input = element<HTMLInputElement>('input'),
    form = element<HTMLFormElement>('form'),
    image = element<HTMLImageElement>('img'),
    secret = element<HTMLElement>('[data-mfa-secret]'),
    setup = element<HTMLElement>('[data-mfa-setup]'),
    copy = element<HTMLElement>('[data-mfa-copy]'),
    submit = element<HTMLButtonElement>('[type=submit]');
  const clear = () => {
    generation++;
    factor = null;
    busy = false;
    root.hidden = true;
    input.value = '';
    image.removeAttribute('src');
    secret.textContent = '';
    setup.hidden = true;
  };
  client.onClear(clear);
  element<HTMLButtonElement>('[data-mfa-cancel]').addEventListener('click', () => {
    clear();
    onCancel();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !factor) return;
    const stamp = generation;
    busy = true;
    const code = input.value;
    input.value = '';
    submit.disabled = true;
    try {
      await client.verifyFactor(factor.id, code);
      if (stamp !== generation) return;
      const sessionEpoch = client.epoch();
      clear();
      try {
        await onVerified();
      } catch (error) {
        if (sessionEpoch === client.epoch())
          onError(error instanceof Error ? error.message : String(error));
      }
    } catch (error) {
      if (stamp === generation) {
        // Independent sessions consume challenges before verification. Do not
        // encourage resubmitting the consumed challenge after a denied code or
        // uncertain network response; legacy clients retain their own behavior.
        if (error instanceof Error && 'restartMfa' in error && error.restartMfa === true) clear();
        onError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (stamp === generation) busy = false;
      submit.disabled = false;
    }
  });
  return {
    clear,
    async open({ enroll = true } = {}) {
      clear();
      const stamp = generation;
      root.hidden = false;
      form.hidden = true;
      try {
        const list = await client.factors();
        if (stamp !== generation) return;
        factor = list.find((f) => f.status === 'verified');
        if (!factor && !enroll) {
          clear();
          return false;
        }
        if (!factor) {
          const next = await client.enroll();
          if (stamp !== generation) return;
          if (!next?.id || typeof next.totp?.secret !== 'string')
            throw Error('Authenticator setup could not be loaded.');
          factor = next;
          // SVG is an image source, never inserted as active markup.
          const qr = next.totp.qr_code;
          if (qr !== undefined && !qr.startsWith('<svg') && !qr.startsWith('data:image/svg+xml'))
            throw Error('Authenticator image could not be loaded.');
          image.hidden = qr === undefined;
          if (qr !== undefined)
            image.src = qr.startsWith('<svg')
              ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`
              : qr;
          secret.textContent = next.totp.secret;
          setup.hidden = false;
        }
        copy.textContent =
          factor.status === 'verified'
            ? 'Enter the code from your existing business authenticator.'
            : 'Add the setup key to your authenticator app, then enter its six-digit code.';
        form.hidden = false;
        input.focus();
        return true;
      } catch (error) {
        if (stamp === generation) {
          clear();
          onError(error instanceof Error ? error.message : String(error));
        }
        throw error;
      }
    },
  };
}
