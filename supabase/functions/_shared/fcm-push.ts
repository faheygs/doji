export type FcmMessage = {
  token: string;
  title: string;
  body: string;
  collapseKey: string;
  ttlSeconds: number;
  data: Record<string, string>;
};

export type FcmResult = {
  outcome: 'accepted' | 'invalid_token' | 'rejected' | 'transport_error';
  providerId?: string;
  error?: string;
};

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function base64Url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function privateKeyBytes(pem: string): ArrayBuffer {
  const body = pem.replaceAll('\\n', '\n')
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/gu, '');
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt - now > 120) {
    return cachedAccessToken.value;
  }
  const clientEmail = Deno.env.get('FCM_CLIENT_EMAIL');
  const privateKey = Deno.env.get('FCM_PRIVATE_KEY');
  if (!clientEmail || !privateKey) throw new Error('FCM credentials are not configured');

  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );
  const assertion = `${signingInput}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    signal: AbortSignal.timeout(5_000),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const payload = await response.json() as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(`FCM OAuth ${response.status}: ${payload.error ?? 'missing access token'}`);
  }
  cachedAccessToken = {
    value: payload.access_token,
    expiresAt: now + Math.max(60, payload.expires_in ?? 3600),
  };
  return payload.access_token;
}

export function fcmConfigured(): boolean {
  return Boolean(
    Deno.env.get('FCM_PROJECT_ID') &&
      Deno.env.get('FCM_CLIENT_EMAIL') &&
      Deno.env.get('FCM_PRIVATE_KEY'),
  );
}

export async function sendFcmMessage(message: FcmMessage): Promise<FcmResult> {
  try {
    const projectId = Deno.env.get('FCM_PROJECT_ID')!;
    const authorization = await accessToken();
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(5_000),
        headers: {
          authorization: `Bearer ${authorization}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: message.token,
            notification: { title: message.title, body: message.body },
            data: message.data,
            android: {
              priority: 'HIGH',
              ttl: `${Math.max(1, message.ttlSeconds)}s`,
              collapse_key: message.collapseKey,
              notification: { sound: 'default' },
            },
          },
        }),
      },
    );
    const payload = await response.json() as {
      name?: string;
      error?: { message?: string; details?: Array<{ errorCode?: string }> };
    };
    if (response.ok) return { outcome: 'accepted', providerId: payload.name };
    const errorCode = payload.error?.details?.find((detail) => detail.errorCode)?.errorCode;
    const invalid = errorCode === 'UNREGISTERED' || errorCode === 'SENDER_ID_MISMATCH';
    return {
      outcome: invalid ? 'invalid_token' : 'rejected',
      error: `FCM ${response.status}: ${errorCode ?? payload.error?.message ?? 'rejected'}`,
    };
  } catch (error) {
    return {
      outcome: 'transport_error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
