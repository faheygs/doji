import { uploadPostMedia, uploadPostVideo, uploadAvatar, compressImage } from '../../utils/upload';
import { supabase } from '../../lib/supabase';
import * as ImageManipulator from 'expo-image-manipulator';
import { resumableStorageUpload } from '../../utils/resumableUpload';

jest.mock('../../lib/supabase');
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn().mockResolvedValue({ uri: 'file://compressed.jpg' }),
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
        publicUrl:
          'https://project.supabase.co/storage/v1/object/public/post-media/user/file.jpg',
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

describe('uploadPostMedia', () => {
  it('compresses, uploads to post-media bucket, and returns public URL', async () => {
    setupStorageMock();
    const url = await uploadPostMedia('event-1', 'command-123456789', 'file://photo.jpg', 'photo');

    expect(mockStorageFrom).toHaveBeenCalledWith('post-media');
    expect(resumableStorageUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        bucketId: 'post-media',
        objectPath: 'user-123/events/event-1/upload-photo.jpg',
        contentType: 'image/jpeg',
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
});

describe('uploadPostVideo', () => {
  it('uploads video to post-media bucket', async () => {
    setupStorageMock();
    const url = await uploadPostVideo('event-1', 'command-123456789', 'file://video.mp4');

    expect(mockStorageFrom).toHaveBeenCalledWith('post-media');
    expect(resumableStorageUpload).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'video/mp4' }),
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
