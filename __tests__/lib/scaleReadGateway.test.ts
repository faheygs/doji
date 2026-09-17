import { readThroughScaleGateway } from '../../lib/scaleReadGateway';
import { supabase } from '../../lib/supabase';

describe('scale-read client', () => {
  const originalFetch = global.fetch;
  const mockGetSession = jest.spyOn(supabase.auth, 'getSession');
  const mockRefreshSession = jest.spyOn(supabase.auth, 'refreshSession');

  beforeEach(() => {
    process.env.EXPO_PUBLIC_SCALE_READ_URL = 'https://scale.test';
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'old-token' } },
      error: null,
    });
    mockRefreshSession.mockResolvedValue({
      data: { session: { access_token: 'new-token' } },
      error: null,
    });
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_SCALE_READ_URL;
    global.fetch = originalFetch;
  });

  it('refreshes an expired session once and keeps the read on the gateway', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"expired"}', { status: 401 }))
      .mockResolvedValueOnce(Response.json({ id: 'profile' }));
    global.fetch = fetchMock;
    const directRead = jest.fn();

    await expect(
      readThroughScaleGateway('/v1/profiles/tester', directRead),
    ).resolves.toEqual({ id: 'profile' });
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://scale.test/v1/profiles/tester',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer new-token' }),
      }),
    );
    expect(directRead).not.toHaveBeenCalled();
  });

  it('uses the direct read only when scale mode is not configured', async () => {
    delete process.env.EXPO_PUBLIC_SCALE_READ_URL;
    const directRead = jest.fn().mockResolvedValue({ id: 'direct' });

    await expect(readThroughScaleGateway('/v1/profiles/tester', directRead)).resolves.toEqual({
      id: 'direct',
    });
    expect(mockGetSession).not.toHaveBeenCalled();
  });
});
