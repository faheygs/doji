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

let cachedJwt: { value: string; issuedAt: number } | null = null;

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

async function providerJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.issuedAt < 45 * 60) return cachedJwt.value;

  const keyId = Deno.env.get('APNS_KEY_ID');
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const privateKey = Deno.env.get('APNS_PRIVATE_KEY');
  if (!keyId || !teamId || !privateKey) throw new Error('APNs credentials are not configured');

  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const payload = base64Url(JSON.stringify({ iss: teamId, iat: now }));
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
  const value = `${signingInput}.${base64Url(new Uint8Array(signature))}`;
  cachedJwt = { value, issuedAt: now };
  return value;
}

export function apnsConfigured(): boolean {
  return Boolean(
    Deno.env.get('APNS_KEY_ID') &&
      Deno.env.get('APNS_TEAM_ID') &&
      Deno.env.get('APNS_PRIVATE_KEY') &&
      Deno.env.get('APNS_BUNDLE_ID'),
  );
}

export async function sendApnsMessage(message: ApnsMessage): Promise<ApnsResult> {
  try {
    const authorization = await providerJwt();
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
    const providerId = response.headers.get('apns-id') ?? undefined;
    if (response.ok) return { outcome: 'accepted', providerId };

    const responseBody = await response.text();
    const invalid = response.status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/u.test(responseBody);
    return {
      outcome: invalid ? 'invalid_token' : 'rejected',
      providerId,
      error: `APNs ${response.status}: ${responseBody}`,
    };
  } catch (error) {
    return {
      outcome: 'transport_error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
