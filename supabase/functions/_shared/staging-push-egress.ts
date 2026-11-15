import { readBodyText, readJsonBody } from './json-body.ts';

const topic = 'com.doit.challengeapp.staging';
const project = 'doji-staging';
const issuer = 'doji-staging-push@doji-staging.iam.gserviceaccount.com';
const oauth = 'https://oauth2.googleapis.com/token';
const messagingScope = 'https://www.googleapis.com/auth/firebase.messaging';
type RecordValue = Record<string, unknown>;
export type StagingPushAuthorization = (request: Request) => Promise<boolean>;

function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Staging push payload denied');
  return value as RecordValue;
}

function jwt(value: string): [RecordValue, RecordValue] {
  const parts = value.split('.');
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part)))
    throw Error('Staging push credential denied');
  const decode = (part: string) =>
    record(JSON.parse(atob(part.replaceAll('-', '+').replaceAll('_', '/'))));
  return [decode(parts[0]!), decode(parts[1]!)];
}

async function deviceAllowed(value: unknown, hashes: ReadonlySet<string>): Promise<boolean> {
  if (typeof value !== 'string' || value.length < 16 || value.length > 4096) return false;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const hash = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  return hashes.has(hash);
}

/** Only the Staging relay package installs this additional, default-off egress grant. */
export function stagingPushPolicy(
  get: (name: string) => string | undefined,
): StagingPushAuthorization | undefined {
  if (get('STAGING_PUSH_ENABLED') !== 'true') return undefined;
  const keyId = get('APNS_KEY_ID');
  if (
    get('DOJI_ENVIRONMENT') !== 'staging' ||
    get('SUPABASE_URL') !== 'https://ohrcupagdoilkwhecict.supabase.co' ||
    get('APNS_BUNDLE_ID') !== topic ||
    get('APNS_TEAM_ID') !== 'HUG35JPQGG' ||
    !keyId ||
    !/^[A-Z0-9]{10}$/.test(keyId) ||
    get('FCM_PROJECT_ID') !== project ||
    get('FCM_CLIENT_EMAIL') !== issuer
  )
    throw Error('Staging push bindings rejected');
  const configured = get('STAGING_PUSH_DEVICE_HASHES') || '';
  if (configured.length > 2048) throw Error('Staging push device allowlist rejected');
  const devices = record(JSON.parse(configured));
  if (Object.keys(devices).some((key) => key !== 'apns' && key !== 'fcm'))
    throw Error('Staging push device allowlist rejected');
  const list = (value: unknown): Set<string> => {
    if (
      !Array.isArray(value) ||
      value.length > 5 ||
      value.some((hash) => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))
    )
      throw Error('Staging push device allowlist rejected');
    return new Set(value as string[]);
  };
  const apns = list(devices.apns),
    fcm = list(devices.fcm);
  if (apns.size + fcm.size === 0) throw Error('Staging push device allowlist rejected');

  const authorize: StagingPushAuthorization = async (request) => {
    const url = new URL(request.url);
    if (
      request.method !== 'POST' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.port
    )
      return false;
    const now = Math.floor(Date.now() / 1000);
    const authorization = request.headers.get('authorization') || '';
    if (url.href === oauth) {
      if (
        fcm.size === 0 ||
        request.headers.get('content-type') !== 'application/x-www-form-urlencoded'
      )
        return false;
      const body = new URLSearchParams(await readBodyText(request, 8192));
      if (
        Array.from(body).length !== 2 ||
        body.get('grant_type') !== 'urn:ietf:params:oauth:grant-type:jwt-bearer'
      )
        return false;
      const [header, claims] = jwt(body.get('assertion') || '');
      // Google verifies the signature; this boundary prevents exchanging another identity/scope.
      return (
        header.alg === 'RS256' &&
        claims.iss === issuer &&
        claims.aud === oauth &&
        claims.scope === messagingScope &&
        typeof claims.iat === 'number' &&
        typeof claims.exp === 'number' &&
        claims.iat <= now + 60 &&
        claims.iat >= now - 60 &&
        claims.exp > now &&
        claims.exp <= claims.iat + 3600
      );
    }
    if (request.headers.get('content-type') !== 'application/json') return false;
    if (
      url.origin === 'https://api.push.apple.com' &&
      /^\/3\/device\/[a-fA-F0-9]{64,200}$/.test(url.pathname)
    ) {
      if (
        request.headers.get('apns-topic') !== topic ||
        request.headers.get('apns-push-type') !== 'alert' ||
        !authorization.startsWith('bearer ')
      )
        return false;
      const [header, claims] = jwt(authorization.slice(7));
      if (header.alg !== 'ES256' || header.kid !== keyId || claims.iss !== 'HUG35JPQGG')
        return false;
      const expiry = Number(request.headers.get('apns-expiration'));
      if (!Number.isFinite(expiry) || expiry <= now || expiry > now + 300) return false;
      const body = record(await readJsonBody(request, 4096));
      if (!record(body.aps).alert) return false;
      return deviceAllowed(url.pathname.slice('/3/device/'.length), apns);
    }
    if (url.href === `https://fcm.googleapis.com/v1/projects/${project}/messages:send`) {
      if (!/^Bearer \S+$/.test(authorization)) return false;
      const body = record(await readJsonBody(request, 8192));
      if (Object.keys(body).length !== 1 || !body.message) return false;
      const message = record(body.message);
      if (
        Object.keys(message).some(
          (key) => !['token', 'notification', 'data', 'android'].includes(key),
        )
      )
        return false;
      const android = record(message.android);
      if (
        typeof android.ttl !== 'string' ||
        !/^[1-9][0-9]{0,2}s$/.test(android.ttl) ||
        parseInt(android.ttl, 10) > 300
      )
        return false;
      return deviceAllowed(message.token, fcm);
    }
    return false;
  };
  return async (request) => {
    try {
      return await authorize(request);
    } catch {
      throw Error('Staging push request rejected');
    }
  };
}
