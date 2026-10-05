// A purpose-bound envelope prevents this portal from redeeming member/employee
// Auth links. Supabase remains responsible for OTP expiry and single use.
type Ticket = {
  id: string;
  email: string;
  token_hash: string;
  type: 'signup' | 'recovery';
  expires: number;
};
const encode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
const decode = (value: string) =>
  Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
async function key(secret: string) {
  if (secret.length < 32) throw Error('Business link signing is unavailable.');
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
const message = (origin: string, payload: string) =>
  new TextEncoder().encode(`doji-business-access-v1\n${origin}\n${payload}`);
export async function signBusinessLink(
  ticket: Omit<Ticket, 'expires'>,
  secret: string,
  origin: string,
): Promise<string> {
  const payload = encode(
    new TextEncoder().encode(
      JSON.stringify({ ...ticket, expires: Math.floor(Date.now() / 1000) + 3600 }),
    ),
  );
  const signature = await crypto.subtle.sign('HMAC', await key(secret), message(origin, payload));
  return `${payload}.${encode(new Uint8Array(signature))}`;
}
export async function readBusinessLink(
  value: unknown,
  secret: string,
  origin: string,
): Promise<Ticket | null> {
  try {
    if (typeof value !== 'string' || value.length > 2500 || !/^[\w-]+\.[\w-]+$/.test(value))
      return null;
    // The exact two-component shape was validated above.
    const [payload, signature] = value.split('.') as [string, string];
    if (
      !(await crypto.subtle.verify(
        'HMAC',
        await key(secret),
        decode(signature),
        message(origin, payload),
      ))
    )
      return null;
    const ticket = JSON.parse(new TextDecoder().decode(decode(payload)));
    if (
      !/^[0-9a-f-]{36}$/i.test(ticket.id) ||
      typeof ticket.email !== 'string' ||
      typeof ticket.token_hash !== 'string' ||
      !ticket.token_hash ||
      !['signup', 'recovery'].includes(ticket.type) ||
      !Number.isInteger(ticket.expires) ||
      ticket.expires <= Date.now() / 1000 ||
      ticket.expires > Date.now() / 1000 + 3600
    )
      return null;
    return ticket;
  } catch {
    return null;
  }
}
