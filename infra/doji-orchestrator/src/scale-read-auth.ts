export type ScaleReadAuthEnv = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_JWT_SECRET?: string;
};

type JwtHeader = { alg?: string; kid?: string };
type JwtPayload = {
  aud?: string | string[];
  exp?: number;
  iss?: string;
  nbf?: number;
  role?: string;
  sub?: string;
};
type Jwks = { keys?: Array<JsonWebKey & { kid?: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let jwksPromise: Promise<Jwks> | null = null;

export function normalizedSupabaseUrl(env: ScaleReadAuthEnv): string {
  return env.SUPABASE_URL.replace(/\/$/, '');
}

function decodePart<T>(value: string): T {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(
    atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')),
    (character) => character.charCodeAt(0),
  );
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function decodeBytes(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(
    atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')),
    (character) => character.charCodeAt(0),
  );
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function readJwks(env: ScaleReadAuthEnv, refresh = false): Promise<Jwks> {
  if (!jwksPromise || refresh) {
    jwksPromise = fetch(`${normalizedSupabaseUrl(env)}/auth/v1/.well-known/jwks.json`, {
      headers: { apikey: env.SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(5_000),
    }).then(async (response) => {
      if (!response.ok) throw new Error(`JWKS unavailable (${response.status})`);
      return response.json() as Promise<Jwks>;
    });
  }
  try {
    return await jwksPromise;
  } catch (error) {
    jwksPromise = null;
    throw error;
  }
}

async function verificationKey(env: ScaleReadAuthEnv, header: JwtHeader): Promise<CryptoKey> {
  if (header.alg === 'HS256') {
    if (!env.SUPABASE_JWT_SECRET) throw new Error('Legacy JWT verification is not configured');
    return crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.SUPABASE_JWT_SECRET),
      { hash: 'SHA-256', name: 'HMAC' },
      false,
      ['verify'],
    );
  }
  if (!header.kid || !['ES256', 'RS256'].includes(header.alg ?? '')) {
    throw new Error('Unsupported access token');
  }
  let jwks = await readJwks(env);
  let jwk = jwks.keys?.find((candidate) => candidate.kid === header.kid);
  if (!jwk) {
    jwks = await readJwks(env, true);
    jwk = jwks.keys?.find((candidate) => candidate.kid === header.kid);
  }
  if (!jwk) throw new Error('Unknown access token key');
  const algorithm =
    header.alg === 'ES256'
      ? { name: 'ECDSA', namedCurve: 'P-256' }
      : { hash: 'SHA-256', name: 'RSASSA-PKCS1-v1_5' };
  return crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify']);
}

export async function authenticateScaleReadRequest(
  request: Request,
  env: ScaleReadAuthEnv,
): Promise<{ token: string; userId: string }> {
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) throw new Error('Authentication required');
  const token = authorization.slice(7);
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid access token');
  let header: JwtHeader;
  let payload: JwtPayload;
  try {
    header = decodePart<JwtHeader>(parts[0]);
    payload = decodePart<JwtPayload>(parts[1]);
  } catch {
    throw new Error('Invalid access token');
  }
  const key = await verificationKey(env, header);
  const algorithm =
    header.alg === 'ES256'
      ? { hash: 'SHA-256', name: 'ECDSA' }
      : header.alg === 'RS256'
        ? { name: 'RSASSA-PKCS1-v1_5' }
        : { name: 'HMAC' };
  const valid = await crypto.subtle.verify(
    algorithm,
    key,
    decodeBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  const now = Math.floor(Date.now() / 1_000);
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (
    !valid ||
    !payload.sub ||
    !UUID.test(payload.sub) ||
    payload.role !== 'authenticated' ||
    payload.iss !== `${normalizedSupabaseUrl(env)}/auth/v1` ||
    !audience.includes('authenticated') ||
    !payload.exp ||
    payload.exp <= now - 30 ||
    (payload.nbf != null && payload.nbf > now + 30)
  ) {
    throw new Error('Invalid access token');
  }
  return { token, userId: payload.sub };
}
