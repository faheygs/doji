(() => {
  const config = window.DOJI_EMPLOYEE_SETUP_CONFIG;
  const byId = id => document.getElementById(id);
  let signingIn = false, busy = false, email = '', temporarySession = null, factor = null, accessStatus = null, startedAt = 0;
  const status = (message = '', failed = false) => {
    const target = byId('setupStatus');
    target.textContent = message; target.hidden = !message;
    target.classList.toggle('error', failed); target.setAttribute('role', failed ? 'alert' : 'status');
    if (failed) { target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  };
  async function request(path, body, token, method = 'POST') {
    const result = await fetch(`${config.supabaseUrl}${path}`, {
      method, signal: AbortSignal.timeout(15000),
      headers: { apikey: config.supabaseAnonKey, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(method === 'DELETE' ? {} : { body: JSON.stringify(body) }),
    });
    const data = await result.json().catch(() => null);
    if (!result.ok) throw new Error(data?.message || data?.msg || data?.error_description || 'Setup could not be completed. Please try again.');
    return data;
  }
  function setBusy(value) {
    busy = value;
    document.querySelectorAll('button').forEach(button => { button.disabled = value; });
    byId('setupForm').setAttribute('aria-busy', String(value));
    byId('securityForm').setAttribute('aria-busy', String(value));
  }
  function screen(step, heading, description) {
    const panels = { account: 'setupForm', email: 'emailConfirmation', security: 'securitySetup', access: 'setupComplete' };
    Object.values(panels).forEach(id => { byId(id).hidden = id !== panels[step]; });
    document.querySelectorAll('[data-step]').forEach(item => {
      if (item.dataset.step === step) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
    });
    byId('setupEyebrow').textContent = `WORK ACCOUNT · STEP 0${Object.keys(panels).indexOf(step) + 1}`;
    byId('setupHeading').textContent = heading; byId('setupDescription').textContent = description;
    byId('setupSymbol').hidden = !['email', 'access'].includes(step);
    byId('setupSymbol').textContent = step === 'email' ? '✉' : '✓';
    byId('setupMode').hidden = step !== 'account';
    byId('setupResend').hidden = !['account', 'email'].includes(step);
    byId('setupRestart').hidden = step === 'account';
    status(); byId('setupHeading').focus();
  }
  function clearSecrets() {
    factor = null; startedAt = 0;
    byId('setupCode').value = ''; byId('setupPassword').value = '';
    byId('setupQr').removeAttribute('src'); byId('setupSecret').textContent = '';
    byId('newAuthenticator').hidden = true;
  }
  async function releaseSession() {
    const token = temporarySession?.access_token; temporarySession = null; clearSecrets();
    if (token) await request('/auth/v1/logout?scope=local', {}, token).catch(() => undefined);
  }
  function credentials(signin = true) {
    signingIn = signin;
    byId('nameField').hidden = signin; byId('setupName').required = !signin;
    byId('setupPassword').value = ''; byId('setupPassword').autocomplete = signin ? 'current-password' : 'new-password';
    byId('setupSubmit').textContent = signin ? 'Continue securely' : 'Create employee account';
    byId('setupMode').textContent = signin ? 'Create a new work account' : 'Already have a work account? Sign in';
    screen('account', signin ? 'Welcome back to work.' : 'Create your work account', signin ? 'Sign in with your verified work email. Your personal app account stays separate.' : 'Use your approved work email and a separate password.');
    if (email) byId('setupEmail').value = email;
  }
  function confirmation() {
    screen('email', 'Check your email.', 'One more step to make this work account yours.');
    byId('confirmationEmail').textContent = email;
  }
  function employeeSession(session) {
    return session?.access_token && session.user?.role === 'doji_employee' && session.user?.app_metadata?.account_type === 'employee';
  }
  async function finish() {
    const result = await request('/rest/v1/rpc/get_employee_registration_status_v1', {}, temporarySession.access_token);
    accessStatus = result.status;
    if (!['pending', 'active'].includes(accessStatus)) throw new Error('Employee access is disabled. Contact your administrator.');
    await releaseSession();
    screen('access', 'Security setup complete.', accessStatus === 'pending' ? 'Your work account is ready for administrator approval.' : 'Your work account is approved.');
    byId('accessDescription').textContent = accessStatus === 'pending'
      ? 'Email and authenticator are verified. Your administrator still needs to approve your permissions. You can safely close this page; do not register again.'
      : config.employeePortalEnabled === true
        ? 'You’re ready. Open your workspace and sign in with your work email and existing authenticator.'
        : 'Your email and authenticator are ready. Your administrator will confirm when to enter the portal.';
    byId('openEmployeePortal').hidden = accessStatus !== 'active' || config.employeePortalEnabled !== true;
  }
  async function prepareSecurity() {
    const factors = temporarySession.user?.factors || [];
    factor = factors.find(item => (item.factor_type || item.type) === 'totp' && item.status === 'verified');
    screen('security', factor ? 'Verify it’s you.' : 'Secure your work account.', factor ? 'Use your existing Doji authenticator. No new QR code or reset is needed.' : 'Add one authenticator to protect your future work sign-ins.');
    if (!factor) {
      for (const stale of factors.filter(item => (item.factor_type || item.type) === 'totp' && item.status === 'unverified')) {
        await request(`/auth/v1/factors/${encodeURIComponent(stale.id)}`, null, temporarySession.access_token, 'DELETE');
      }
      const enrollment = await request('/auth/v1/factors', { factor_type: 'totp', friendly_name: 'Doji Work', issuer: 'Doji Work' }, temporarySession.access_token);
      if (!enrollment?.id || enrollment.type !== 'totp' || !enrollment.totp?.qr_code || !enrollment.totp?.secret) throw new Error('Authenticator setup was incomplete. Sign in again to create a fresh QR code.');
      factor = enrollment;
      byId('setupQr').src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.totp.qr_code)}`;
      byId('setupSecret').textContent = enrollment.totp.secret; byId('newAuthenticator').hidden = false;
    }
    byId('setupCode').focus();
  }
  byId('setupMode').addEventListener('click', () => { if (!busy) credentials(!signingIn); });
  byId('emailContinue').addEventListener('click', () => { if (!busy) credentials(true); });
  byId('setupRestart').addEventListener('click', async () => {
    if (busy) return; setBusy(true); await releaseSession(); email = ''; credentials(true); setBusy(false);
  });
  byId('setupForm').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return; setBusy(true); status();
    try {
      email = byId('setupEmail').value.trim();
      const password = byId('setupPassword').value; byId('setupPassword').value = '';
      if (!signingIn) {
        await request('/functions/v1/employee-register', { email, password, displayName: byId('setupName').value.trim() });
        confirmation();
      } else {
        const session = await request('/functions/v1/employee-signin', { email, password });
        if (!employeeSession(session)) throw new Error('A separate employee identity is required.');
        temporarySession = session; startedAt = Date.now();
        const result = await request('/rest/v1/rpc/get_employee_registration_status_v1', {}, session.access_token);
        if (!['pending', 'active'].includes(result.status)) throw new Error('Employee access is disabled. Contact your administrator.');
        accessStatus = result.status;
        await prepareSecurity();
      }
    } catch (error) {
      await releaseSession(); credentials(signingIn);
      status(error.name === 'TimeoutError' ? 'The request timed out. Check your email or use Resend verification email before registering again.' : error.message, true);
    } finally { setBusy(false); }
  });
  byId('securityForm').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return; setBusy(true); status();
    let verified = false;
    try {
      if (!temporarySession || !factor?.id || Date.now() - startedAt > 10 * 60 * 1000) {
        await releaseSession(); credentials(true); throw new Error('Your setup session expired. Sign in again. Your verified authenticator is kept.');
      }
      const code = byId('setupCode').value.trim(); byId('setupCode').value = '';
      if (!/^\d{6}$/.test(code)) throw new Error('Enter the current six-digit authenticator code.');
      const path = `/auth/v1/factors/${encodeURIComponent(factor.id)}`;
      // A fresh challenge on every explicit attempt repairs an expired/rejected challenge.
      const challenge = await request(`${path}/challenge`, {}, temporarySession.access_token);
      const session = await request(`${path}/verify`, { challenge_id: challenge.id, code }, temporarySession.access_token);
      if (!employeeSession(session)) throw new Error('Employee verification could not be confirmed. Sign in again.');
      const encoded = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const claims = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
      if (claims.aal !== 'aal2' || claims.role !== 'doji_employee') throw new Error('Authenticator verification did not complete. Sign in again.');
      temporarySession = session; verified = true; clearSecrets();
      await finish();
    } catch (error) {
      if (verified) { await releaseSession(); credentials(true); }
      status(verified ? `Authenticator verified, but access status could not be loaded. Sign in again with your existing authenticator. ${error.message}` : error.message, true);
    } finally { setBusy(false); }
  });
  byId('setupResend').addEventListener('click', async () => {
    if (busy) return;
    if (!byId('setupForm').hidden) { if (!byId('setupEmail').reportValidity()) return; email = byId('setupEmail').value.trim(); }
    setBusy(true);
    try {
      const result = await request('/functions/v1/employee-register', { action: 'resend_verification', email });
      confirmation(); status(result.message);
    } catch (error) { status(error.message, true); } finally { setBusy(false); }
  });
  // Email-return fragments are never persisted or treated as authorization.
  // A fresh server-validated employee password + MFA is still required.
  if (location.hash) {
    const hash = new URLSearchParams(location.hash.slice(1));
    const failed = hash.has('error') || hash.has('error_code');
    history.replaceState(null, '', location.pathname);
    credentials(true);
    status(failed ? 'This verification link could not be used. Try signing in if you already verified, or request a new email.' : 'Email verification returned. Sign in to confirm your work account and finish setup.', failed);
  }
})();
