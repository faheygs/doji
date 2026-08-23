export type ApnsMessage = {
  token: string;
  environment: 'sandbox' | 'production';
  title: string;
  body: string;
  collapseId: string;
  expiresAtEpochSeconds: number;
  interruptionLevel?: 'passive' | 'active' | 'time-sensitive';
  data: Record<string, unknown>;
};

export type ApnsResult = {
  outcome: 'accepted' | 'invalid_token' | 'rejected' | 'transport_error';
  providerId?: string;
  error?: string;
};

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

type ProviderToken = { value: string; issuedAt: number };
type ProviderTokenClaim = {
  state?: 'ready' | 'refresh' | 'wait';
  provider_token?: string | null;
  issued_at?: string | null;
  lease_id?: string | null;
  retry_after_ms?: number;
};

let cachedJwt: ProviderToken | null = null;
let jwtResolution: Promise<ProviderToken> | null = null;

function base64Url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function privateKeyBytes(pem: string): ArrayBuffer {
  const normalized = pem.replaceAll('\\n', '\n');
  const body = normalized
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/gu, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function mintProviderJwt(issuedAt: number): Promise<string> {
  const keyId = Deno.env.get('APNS_KEY_ID');
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const privateKey = Deno.env.get('APNS_PRIVATE_KEY');
  if (!keyId || !teamId || !privateKey) throw new Error('APNs credentials are not configured');

  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const payload = base64Url(JSON.stringify({ iss: teamId, iat: issuedAt }));
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes(privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

function parseIssuedAt(value: string | null | undefined): number | null {
  if (!value) return null;
  const epochSeconds = Math.floor(Date.parse(value) / 1000);
  return Number.isFinite(epochSeconds) ? epochSeconds : null;
}

async function resolveSharedProviderJwt(database: RpcClient): Promise<ProviderToken> {
  const now = Math.floor(Date.now() / 1000);
  const keyId = Deno.env.get('APNS_KEY_ID');
  const teamId = Deno.env.get('APNS_TEAM_ID');
  if (!keyId || !teamId) throw new Error('APNs credentials are not configured');

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data, error } = await database.rpc('claim_apns_provider_token', {
      p_key_id: keyId,
      p_team_id: teamId,
    });
    if (error) throw new Error(`APNs token coordination failed: ${error.message}`);
    const claim = (data ?? {}) as ProviderTokenClaim;
    const existingIssuedAt = parseIssuedAt(claim.issued_at);

    if (claim.state === 'ready' && claim.provider_token && existingIssuedAt) {
      return { value: claim.provider_token, issuedAt: existingIssuedAt };
    }

    if (claim.state === 'refresh' && claim.lease_id) {
      const issuedAt = Math.floor(Date.now() / 1000);
      const value = await mintProviderJwt(issuedAt);
      const { data: stored, error: storeError } = await database.rpc(
        'store_apns_provider_token',
        {
          p_key_id: keyId,
          p_team_id: teamId,
          p_lease_id: claim.lease_id,
          p_provider_token: value,
          p_issued_at: new Date(issuedAt * 1000).toISOString(),
        },
      );
      if (storeError) throw new Error(`APNs token publication failed: ${storeError.message}`);
      if (stored === true) return { value, issuedAt };
    }

    const delay = Math.max(25, Math.min(150, Number(claim.retry_after_ms ?? 50)));
    await new Promise((resolve) => {
      setTimeout(resolve, delay);
    });
  }

  throw new Error('APNs provider token was not available before the coordination deadline');
}

async function providerJwt(database: RpcClient, bypassLocal = false): Promise<ProviderToken> {
  const now = Math.floor(Date.now() / 1000);
  if (!bypassLocal && cachedJwt && now - cachedJwt.issuedAt < 45 * 60) return cachedJwt;
  if (jwtResolution) return jwtResolution;

  jwtResolution = resolveSharedProviderJwt(database)
    .then((token) => {
      cachedJwt = token;
      return token;
    })
    .finally(() => {
      jwtResolution = null;
    });
  return jwtResolution;
}

export function apnsConfigured(): boolean {
  return Boolean(
    Deno.env.get('APNS_KEY_ID') &&
      Deno.env.get('APNS_TEAM_ID') &&
      Deno.env.get('APNS_PRIVATE_KEY') &&
      Deno.env.get('APNS_BUNDLE_ID'),
  );
}

type ApnsResponse = {
  response: Response;
  body: string;
  providerId?: string;
};

async function sendRequest(message: ApnsMessage, authorization: string): Promise<ApnsResponse> {
  const bundleId = Deno.env.get('APNS_BUNDLE_ID')!;
  const host = message.environment === 'production'
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com';
  const response = await fetch(`${host}/3/device/${encodeURIComponent(message.token)}`, {
    method: 'POST',
    // Provider ambiguity is terminal by design. Bound the handoff so one bad
    // APNs connection cannot consume the fanout lease or hold an entire page.
    signal: AbortSignal.timeout(5_000),
    headers: {
      authorization: `bearer ${authorization}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-expiration': String(message.expiresAtEpochSeconds),
      'apns-collapse-id': message.collapseId,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      aps: {
        alert: { title: message.title, body: message.body },
        sound: 'default',
        badge: 1,
        'thread-id': message.collapseId,
        'interruption-level': message.interruptionLevel ?? 'active',
      },
      ...message.data,
    }),
  });
  return {
    response,
    body: response.ok ? '' : await response.text(),
    providerId: response.headers.get('apns-id') ?? undefined,
  };
}

function isProviderCredentialError(body: string): boolean {
  return /TooManyProviderTokenUpdates|InvalidProviderToken|ExpiredProviderToken/u.test(body);
}

export async function sendApnsMessage(
  database: RpcClient,
  message: ApnsMessage,
): Promise<ApnsResult> {
  try {
    const authorization = await providerJwt(database);
    let result = await sendRequest(message, authorization.value);

    // A concrete 4xx means APNs did not accept the notification. Reconcile the
    // canonical shared credential and retry once only when another worker has
    // already published a different token. Never mint on the error path and
    // never retry an ambiguous transport failure.
    if (!result.response.ok && isProviderCredentialError(result.body)) {
      cachedJwt = null;
      const canonical = await providerJwt(database, true);
      if (canonical.value !== authorization.value) {
        result = await sendRequest(message, canonical.value);
      }
    }

    if (result.response.ok) return { outcome: 'accepted', providerId: result.providerId };

    const invalid = result.response.status === 410 ||
      /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/u.test(result.body);
    return {
      outcome: invalid ? 'invalid_token' : 'rejected',
      providerId: result.providerId,
      error: `APNs ${result.response.status}: ${result.body}`,
    };
  } catch (error) {
    return {
      outcome: 'transport_error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
