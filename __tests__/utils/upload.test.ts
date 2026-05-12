import { uploadPostMedia, uploadPostVideo, uploadAvatar, compressImage } from '../../utils/upload';
import { supabase } from '../../lib/supabase';
import * as ImageManipulator from 'expo-image-manipulator';

jest.mock('../../lib/supabase');

const mockStorageFrom = supabase.storage.from as jest.Mock;

function setupStorageMock(uploadError: Error | null = null) {
  const storageBucket = {
    upload: jest.fn().mockResolvedValue({ error: uploadError }),
    getPublicUrl: jest.fn(() => ({
      data: { publicUrl: 'https://cdn.example.com/bucket/file.jpg' },
    })),
  };
  mockStorageFrom.mockReturnValue(storageBucket);
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
    const bucket = setupStorageMock();
    const url = await uploadPostMedia('user-123', 'file://photo.jpg', 'photo');

    expect(mockStorageFrom).toHaveBeenCalledWith('post-media');
    expect(bucket.upload).toHaveBeenCalled();
    const [filePath] = bucket.upload.mock.calls[0];
    expect(filePath).toMatch(/^user-123\/\d+_photo\.jpg$/);
    expect(url).toBe('https://cdn.example.com/bucket/file.jpg');
  });

  it('throws on upload error', async () => {
    setupStorageMock(new Error('Storage full'));
    await expect(uploadPostMedia('user-123', 'file://photo.jpg', 'photo')).rejects.toThrow(
      'Storage full',
    );
  });
});

describe('uploadPostVideo', () => {
  it('uploads video to post-media bucket', async () => {
    const bucket = setupStorageMock();
    const url = await uploadPostVideo('user-123', 'file://video.mp4');

    expect(mockStorageFrom).toHaveBeenCalledWith('post-media');
    const [filePath, , options] = bucket.upload.mock.calls[0];
    expect(filePath).toMatch(/^user-123\/\d+_video\.mp4$/);
    expect(options.contentType).toBe('video/mp4');
    expect(url).toBe('https://cdn.example.com/bucket/file.jpg');
  });

  it('detects MOV content type', async () => {
    const bucket = setupStorageMock();
    await uploadPostVideo('user-123', 'file://clip.MOV');

    const [filePath, , options] = bucket.upload.mock.calls[0];
    expect(options.contentType).toBe('video/quicktime');
    expect(filePath).toMatch(/\.mov$/);
  });
});

describe('uploadAvatar', () => {
  it('uploads to avatars bucket with upsert', async () => {
    const bucket = setupStorageMock();
    const url = await uploadAvatar('user-123', 'file://face.jpg');

    expect(mockStorageFrom).toHaveBeenCalledWith('avatars');
    const [filePath, , options] = bucket.upload.mock.calls[0];
    expect(filePath).toBe('user-123/avatar.jpg');
    expect(options.upsert).toBe(true);
    expect(url).toContain('https://cdn.example.com/bucket/file.jpg');
    expect(url).toMatch(/\?v=\d+/);
  });
});
