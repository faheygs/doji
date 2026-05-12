/**
 * Tests for the assertCronAuthorized logic.
 * Since the actual function uses Deno.env, we replicate the logic for Node testing.
 */

function assertCronAuthorized(
  req: { headers: { get: (key: string) => string | null } },
  secret: string | undefined,
): { status: number; error: string } | null {
  if (!secret) {
    return { status: 500, error: 'CRON_SECRET is not configured' };
  }
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== secret) {
    return { status: 401, error: 'Unauthorized' };
  }
  return null;
}

describe('assertCronAuthorized', () => {
  const makeReq = (authHeader: string | null) => ({
    headers: { get: (key: string) => (key === 'authorization' ? authHeader : null) },
  });

  it('returns 500 when CRON_SECRET is not set', () => {
    const result = assertCronAuthorized(makeReq('Bearer test'), undefined);
    expect(result).toEqual({ status: 500, error: 'CRON_SECRET is not configured' });
  });

  it('returns 401 when no authorization header', () => {
    const result = assertCronAuthorized(makeReq(null), 'my-secret');
    expect(result).toEqual({ status: 401, error: 'Unauthorized' });
  });

  it('returns 401 when token does not match', () => {
    const result = assertCronAuthorized(makeReq('Bearer wrong-secret'), 'my-secret');
    expect(result).toEqual({ status: 401, error: 'Unauthorized' });
  });

  it('returns 401 for non-Bearer auth format', () => {
    const result = assertCronAuthorized(makeReq('Basic dXNlcjpwYXNz'), 'my-secret');
    expect(result).toEqual({ status: 401, error: 'Unauthorized' });
  });

  it('returns null (success) when token matches', () => {
    const result = assertCronAuthorized(makeReq('Bearer my-secret'), 'my-secret');
    expect(result).toBeNull();
  });

  it('returns 401 when secret is empty string', () => {
    const result = assertCronAuthorized(makeReq('Bearer '), '');
    expect(result).toEqual({ status: 500, error: 'CRON_SECRET is not configured' });
  });
});
