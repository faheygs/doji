import {
  compressImage,
  uploadPostMedia,
  uploadPostVideo,
  uploadAvatar,
  removePublicStorageObject,
} from '../../utils/upload';
import { supabase } from '../../lib/supabase';
import { executeCommand } from '../../lib/commandGateway';
import { resumableStorageUpload } from '../../utils/resumableUpload';
import * as ImageManipulator from 'expo-image-manipulator';
jest.mock('../../lib/supabase');
jest.mock('../../lib/commandGateway', () => ({ executeCommand: jest.fn() }));
jest.mock('../../utils/resumableUpload', () => ({ resumableStorageUpload: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));
const remove = jest.fn();
const publicUrl = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(executeCommand).mockResolvedValue({
    data: {
      id: 'reservation',
      bucket_id: 'post-media',
      object_path: 'member/event/reserved',
      content_type: 'image/jpeg',
    },
    error: null,
  });
  jest.mocked(resumableStorageUpload).mockResolvedValue();
  jest
    .mocked(ImageManipulator.manipulateAsync)
    .mockResolvedValue({ uri: 'file:///prepared.jpg', width: 1200, height: 1600 });
  jest
    .mocked(supabase.storage.from)
    .mockReturnValue({ remove, getPublicUrl: publicUrl } as unknown as ReturnType<
      typeof supabase.storage.from
    >);
  remove.mockResolvedValue({ error: null });
  publicUrl.mockReturnValue({
    data: {
      publicUrl:
        'https://synthetic.invalid/storage/v1/object/public/avatars/member/avatar.jpg?existing=1',
    },
  });
});
afterEach(() => jest.restoreAllMocks());

test('explicit compression parameters are honored', async () => {
  await compressImage('file:///source.jpg', { width: 500, quality: 0.7 });
  expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
    'file:///source.jpg',
    [{ resize: { width: 500 } }],
    { compress: 0.7, format: 'jpeg' },
  );
});

test.each([
  ['CLIP.MOV?source=library', 'video/quicktime', 'mov'],
  ['clip.qt', 'video/quicktime', 'mov'],
  ['clip.webm', 'video/webm', 'webm'],
  ['clip.m4v', 'video/x-m4v', 'mp4'],
  ['clip.mp4', 'video/mp4', 'mp4'],
])(
  'video %s reserves the appropriate content type and exact object once',
  async (filename, contentType, extension) => {
    await uploadPostVideo('event', 'command', `file:///${filename}`);
    expect(executeCommand).toHaveBeenCalledWith('reserve_doji_media_upload', {
      p_user_event_id: 'event',
      p_idempotency_key: 'command',
      p_slot: 'video',
      p_extension: extension,
      p_content_type: contentType,
    });
    expect(resumableStorageUpload).toHaveBeenCalledWith(
      expect.objectContaining({ objectPath: 'member/event/reserved', contentType, upsert: true }),
    );
  },
);

test.each([null, {}])('missing reservation %j prevents storage upload', async (data) => {
  // Deliberately malformed server result exercises the runtime validation boundary.
  (executeCommand as jest.Mock).mockResolvedValueOnce({ data, error: null });
  await expect(
    uploadPostMedia(
      'event',
      'command',
      { uri: 'file:///prepared.jpg', width: 1200, height: 1600 },
      'front',
    ),
  ).rejects.toThrow('Could not prepare the media upload');
  expect(resumableStorageUpload).not.toHaveBeenCalled();
});

test('reservation error prevents upload and is returned unchanged', async () => {
  const error = { message: 'not authorized', code: '42501', details: '', hint: '' };
  jest.mocked(executeCommand).mockResolvedValueOnce({ data: null, error });
  await expect(uploadPostVideo('event', 'command', 'file:///clip.mp4')).rejects.toBe(error);
  expect(resumableStorageUpload).not.toHaveBeenCalled();
});

test('failed upload cannot return a public success URL', async () => {
  jest.mocked(resumableStorageUpload).mockRejectedValueOnce(Error('network'));
  await expect(uploadPostVideo('event', 'command', 'file:///clip.mp4')).rejects.toThrow('network');
  expect(publicUrl).not.toHaveBeenCalled();
});

test('avatar cache key preserves an existing query string', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(1234);
  await expect(uploadAvatar('member', 'file:///source.jpg')).resolves.toMatch(
    /\?existing=1&v=1234$/,
  );
  expect(resumableStorageUpload).toHaveBeenCalledWith({
    bucketId: 'avatars',
    objectPath: 'member/avatar-1234.jpg',
    uri: 'file:///prepared.jpg',
    contentType: 'image/jpeg',
  });
});

test.each([
  'https://synthetic.invalid/other/file.jpg',
  'https://synthetic.invalid/storage/v1/object/public/post-media/member/file.jpg',
  'https://synthetic.invalid/storage/v1/object/public/avatars/',
])('nonmatching or empty avatar URL does not delete: %s', async (url) => {
  await removePublicStorageObject('avatars', url);
  expect(remove).not.toHaveBeenCalled();
});

test('storage removal decodes the exact object and strips cache/query fragments', async () => {
  await removePublicStorageObject(
    'avatars',
    'https://synthetic.invalid/storage/v1/object/public/avatars/member/my%20avatar.jpg?v=123#fragment',
  );
  expect(supabase.storage.from).toHaveBeenCalledWith('avatars');
  expect(remove).toHaveBeenCalledWith(['member/my avatar.jpg']);
});

test('storage deletion failure is not mistaken for successful cleanup', async () => {
  const error = Error('permission denied');
  remove.mockResolvedValueOnce({ error });
  await expect(
    removePublicStorageObject(
      'post-media',
      'https://synthetic.invalid/storage/v1/object/public/post-media/member/photo.jpg',
    ),
  ).rejects.toBe(error);
});
