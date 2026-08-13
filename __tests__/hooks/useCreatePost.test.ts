import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase');

describe('Doji post server contract', () => {
  const rpc = supabase.rpc as jest.Mock;

  afterEach(() => jest.clearAllMocks());

  it('uses one atomic complete_doji_with_post RPC', async () => {
    rpc.mockResolvedValue({ data: { id: 'post-1', user_event_id: 'event-abc' }, error: null });
    const command = {
      p_user_event_id: 'event-abc',
      p_post_type: 'photo',
      p_caption: 'Test caption',
      p_photo_url: 'https://cdn.example.com/photo.jpg',
      p_front_photo_url: null,
      p_video_url: null,
      p_visibility: 'friends',
      p_idempotency_key: 'complete-doji:occurrence:event-abc',
    };

    const result = await rpc('complete_doji_with_post', command);

    expect(result.error).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('complete_doji_with_post', command);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('does not fall back to a direct insert when the RPC fails', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('Upload rejected') });
    const result = await rpc('complete_doji_with_post', {
      p_user_event_id: 'event-abc',
      p_post_type: 'photo',
      p_caption: '',
      p_photo_url: null,
      p_front_photo_url: null,
      p_video_url: null,
      p_visibility: 'friends',
      p_idempotency_key: 'complete-doji:occurrence:event-abc',
    });

    expect(result.error?.message).toBe('Upload rejected');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
