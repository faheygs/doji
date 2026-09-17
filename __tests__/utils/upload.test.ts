import {
  uploadPostMedia,
  uploadPostVideo,
  uploadAvatar,
  compressImage,
  preparePostImage,
} from '../../utils/upload';
import { supabase } from '../../lib/supabase';
import * as ImageManipulator from 'expo-image-manipulator';
import { resumableStorageUpload } from '../../utils/resumableUpload';

jest.mock('../../lib/supabase');
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest
    .fn()
    .mockResolvedValue({ uri: 'file://compressed.jpg', width: 1200, height: 1600 }),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));
jest.mock('expo-file-system', () => ({
  File: jest.fn(),
}));
jest.mock('../../utils/resumableUpload', () => ({ resumableStorageUpload: jest.fn() }));

const mockStorageFrom = supabase.storage.from as jest.Mock;

function setupStorageMock() {
  const storageBucket = {
    getPublicUrl: jest.fn(() => ({
      data: {
        publicUrl: 'https://project.supabase.co/storage/v1/object/public/post-media/user/file.jpg',
      },
    })),
  };
  mockStorageFrom.mockReturnValue(storageBucket);
  (supabase.rpc as jest.Mock).mockResolvedValue({
    data: { object_path: 'user-123/events/event-1/upload-photo.jpg' },
    error: null,
  });
  (resumableStorageUpload as jest.Mock).mockResolvedValue(undefined);
  return storageBucket;
}

describe('compressImage', () => {
  afterEach(() => jest.clearAllMocks());

  it('calls ImageManipulator with correct params', async () => {
    const uri = await compressImage('file://original.jpg');
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file://original.jpg',
      [{ resize: { width: 1200 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
    );
    expect(uri).toBe('file://compressed.jpg');
  });
});

describe('preparePostImage', () => {
  afterEach(() => jest.clearAllMocks());

  it('normalizes a portrait photo once and bounds its longest edge', async () => {
    (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValueOnce({
      uri: 'file://prepared.jpg',
      width: 1536,
      height: 2048,
    });

    await expect(
      preparePostImage({ uri: 'file://portrait.heic', width: 3024, height: 4032 }),
    ).resolves.toEqual({ uri: 'file://prepared.jpg', width: 1536, height: 2048 });
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file://portrait.heic',
      [{ resize: { height: 2048 } }],
      { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG },
    );
  });

  it('does not upscale a smaller photo while baking its orientation', async () => {
    await preparePostImage({ uri: 'file://small.jpg', width: 1200, height: 1600 });
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith('file://small.jpg', [], {
      compress: 0.92,
      format: ImageManipulator.SaveFormat.JPEG,
    });
  });
});

describe('uploadPostMedia', () => {
  afterEach(() => jest.clearAllMocks());

  it('compresses, uploads to post-media bucket, and returns public URL', async () => {
    setupStorageMock();
    const url = await uploadPostMedia('event-1', 'command-123456789', 'file://photo.jpg', 'photo');

    expect(mockStorageFrom).toHaveBeenCalledWith('post-media');
    expect(resumableStorageUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        bucketId: 'post-media',
        objectPath: 'user-123/events/event-1/upload-photo.jpg',
        contentType: 'image/jpeg',
        upsert: true,
      }),
    );
    expect(url).toContain('/storage/v1/object/public/post-media/');
  });

  it('throws on upload error', async () => {
    setupStorageMock();
    (resumableStorageUpload as jest.Mock).mockRejectedValueOnce(new Error('Storage full'));
    await expect(
      uploadPostMedia('event-1', 'command-123456789', 'file://photo.jpg', 'photo'),
    ).rejects.toThrow('Storage full');
  });

  it('uploads the exact prepared image without transforming it again', async () => {
    setupStorageMock();
    await uploadPostMedia(
      'event-1',
      'command-123456789',
      { uri: 'file://approved-preview.jpg', width: 1536, height: 2048 },
      'photo',
    );

    expect(ImageManipulator.manipulateAsync).not.toHaveBeenCalled();
    expect(resumableStorageUpload).toHaveBeenCalledWith(
      expect.objectContaining({ uri: 'file://approved-preview.jpg' }),
    );
  });
});

describe('uploadPostVideo', () => {
  it('uploads video to post-media bucket', async () => {
    setupStorageMock();
    const url = await uploadPostVideo('event-1', 'command-123456789', 'file://video.mp4');

    expect(mockStorageFrom).toHaveBeenCalledWith('post-media');
    expect(resumableStorageUpload).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'video/mp4', upsert: true }),
    );
    expect(url).toContain('/storage/v1/object/public/post-media/');
  });

  it('detects MOV content type', async () => {
    setupStorageMock();
    await uploadPostVideo('event-1', 'command-123456789', 'file://clip.MOV');

    expect(supabase.rpc).toHaveBeenCalledWith(
      'reserve_doji_media_upload',
      expect.objectContaining({ p_content_type: 'video/quicktime', p_extension: 'mov' }),
    );
  });
});

describe('uploadAvatar', () => {
  it('uploads to a new immutable avatar path', async () => {
    setupStorageMock();
    const url = await uploadAvatar('user-123', 'file://face.jpg');

    expect(mockStorageFrom).toHaveBeenCalledWith('avatars');
    expect(resumableStorageUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        bucketId: 'avatars',
        objectPath: expect.stringMatching(/^user-123\/avatar-\d+\.jpg$/),
        contentType: 'image/jpeg',
      }),
    );
    expect(url).toContain('/storage/v1/object/public/post-media/');
    expect(url).toMatch(/\?v=\d+/);
  });
});
