// Shared business-only TOTP presentation. No storage, phone factors or polling.
export function createBusinessMfa(root, client, onVerified, onError, onCancel = () => {}) {
  let factor = null,
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
  const input = root.querySelector('input'),
    form = root.querySelector('form');
  const clear = () => {
    generation++;
    factor = null;
    busy = false;
    root.hidden = true;
    input.value = '';
    root.querySelector('img').removeAttribute('src');
    root.querySelector('[data-mfa-secret]').textContent = '';
    root.querySelector('[data-mfa-setup]').hidden = true;
  };
  client.onClear(clear);
  root.querySelector('[data-mfa-cancel]').addEventListener('click', () => {
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
    form.querySelector('[type=submit]').disabled = true;
    try {
      await client.verifyFactor(factor.id, code);
      if (stamp !== generation) return;
      const sessionEpoch = client.epoch();
      clear();
      try {
        await onVerified();
      } catch (error) {
        if (sessionEpoch === client.epoch()) onError(error.message);
      }
    } catch (error) {
      if (stamp === generation) onError(error.message);
    } finally {
      if (stamp === generation) busy = false;
      form.querySelector('[type=submit]').disabled = false;
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
          if (
            !next?.id ||
            typeof next.totp?.secret !== 'string' ||
            typeof next.totp?.qr_code !== 'string'
          )
            throw Error('Authenticator setup could not be loaded.');
          factor = next;
          // SVG is an image source, never inserted as active markup.
          const qr = next.totp.qr_code;
          if (!qr.startsWith('<svg') && !qr.startsWith('data:image/svg+xml'))
            throw Error('Authenticator image could not be loaded.');
          root.querySelector('img').src = qr.startsWith('<svg')
            ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`
            : qr;
          root.querySelector('[data-mfa-secret]').textContent = next.totp.secret;
          root.querySelector('[data-mfa-setup]').hidden = false;
        }
        root.querySelector('[data-mfa-copy]').textContent =
          factor.status === 'verified'
            ? 'Enter the code from your existing business authenticator.'
            : 'Scan the code or enter the setup key, then verify a code from your authenticator.';
        form.hidden = false;
        input.focus();
        return true;
      } catch (error) {
        if (stamp === generation) {
          clear();
          onError(error.message);
        }
        throw error;
      }
    },
  };
}
