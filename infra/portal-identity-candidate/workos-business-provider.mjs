// Candidate only. Credentials and provider tokens must never enter browser code.
import { boundedBody } from './bounded-body.mjs';
export function createWorkosBusinessProvider(config, request = fetch) {
  if (
    !/^client_[A-Za-z0-9]+$/.test(config?.clientId || '') ||
    !/^sk_[A-Za-z0-9_-]{20,}$/.test(config?.apiKey || '')
  )
    throw Error('Invalid business provider configuration');
  const policy = Object.freeze({ ...config });
  async function post(path, body, signal) {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
    const response = await request('https://api.workos.com' + path, {
      method: 'POST',
      redirect: 'error',
      signal: deadline,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${policy.apiKey}` },
      body: JSON.stringify(body),
    });
    if (response.status === 204 && path === '/user_management/sessions/revoke') return {};
    if (!response.ok || !response.body) throw Error('Business authentication unavailable');
    const bytes = await boundedBody(response.body, deadline, 65536);
    return bytes.length ? JSON.parse(new TextDecoder().decode(bytes)) : {};
  }
  async function authenticate(fields, signal) {
    const result = await post(
      '/user_management/authenticate',
      {
        client_id: policy.clientId,
        client_secret: policy.apiKey,
        ...fields,
      },
      signal,
    );
    if (
      result.impersonator ||
      result.user?.email_verified !== true ||
      !/^user_[A-Za-z0-9]+$/.test(result.user?.id || '') ||
      typeof result.access_token !== 'string' ||
      result.access_token.length > 8192 ||
      typeof result.refresh_token !== 'string' ||
      result.refresh_token.length > 8192
    )
      throw Error('Business authentication unavailable');
    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      subject: result.user.id,
    };
  }
  return Object.freeze({
    authorizationUrl({ state, challenge, redirectUri, signup }) {
      const url = new URL('https://api.workos.com/user_management/authorize');
      url.search = new URLSearchParams({
        client_id: policy.clientId,
        provider: 'authkit',
        response_type: 'code',
        redirect_uri: redirectUri,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        screen_hint: signup ? 'sign-up' : 'sign-in',
      }).toString();
      return url.href;
    },
    exchange: (code, verifier, signal) =>
      authenticate({ grant_type: 'authorization_code', code, code_verifier: verifier }, signal),
    refresh: (refreshToken, signal) =>
      authenticate({ grant_type: 'refresh_token', refresh_token: refreshToken }, signal),
    async revoke(sessionId, signal) {
      if (!/^session_[A-Za-z0-9]+$/.test(sessionId || '')) throw Error('Invalid session');
      await post('/user_management/sessions/revoke', { session_id: sessionId }, signal);
    },
  });
}
