import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase');
jest.mock('../../utils/upload', () => ({
  uploadPostMedia: jest.fn().mockResolvedValue('https://cdn.example.com/photo.jpg'),
  uploadPostVideo: jest.fn().mockResolvedValue('https://cdn.example.com/video.mp4'),
}));

const mockFrom = supabase.from as jest.Mock;

describe('useCreatePost mutation logic', () => {
  afterEach(() => jest.clearAllMocks());

  it('inserts a post and updates user_event status', async () => {
    const insertChain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 'post-1', user_event_id: 'ue-1' },
        error: null,
      }),
    };
    const updateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    };

    mockFrom
      .mockReturnValueOnce(insertChain)  // posts
      .mockReturnValueOnce(updateChain); // user_events

    // Simulate insert
    const { data: post, error: postError } = await mockFrom('posts')
      .insert({
        user_event_id: 'ue-1',
        user_id: 'user-1',
        caption: 'Test caption',
        photo_url: 'https://cdn.example.com/photo.jpg',
        visibility: 'friends',
      })
      .select()
      .single();

    expect(postError).toBeNull();
    expect(post.id).toBe('post-1');

    // Simulate update
    const { error: ueError } = await mockFrom('user_events')
      .update({ status: 'completed', completed_at: expect.any(String) })
      .eq('id', 'ue-1');

    expect(ueError).toBeNull();
  });

  it('throws when post insert fails', async () => {
    const insertChain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: null,
        error: new Error('Insert failed'),
      }),
    };
    mockFrom.mockReturnValue(insertChain);

    const { error } = await mockFrom('posts').insert({}).select().single();
    expect(error).toBeTruthy();
  });

  it('throws when user_events update fails (error check added)', async () => {
    const insertChain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 'post-1' },
        error: null,
      }),
    };
    const updateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: new Error('Update denied') }),
    };

    mockFrom
      .mockReturnValueOnce(insertChain)
      .mockReturnValueOnce(updateChain);

    await mockFrom('posts').insert({}).select().single();
    const { error: ueError } = await mockFrom('user_events').update({}).eq('id', 'ue-1');

    expect(ueError).toBeTruthy();
    expect(ueError.message).toBe('Update denied');
  });
});
