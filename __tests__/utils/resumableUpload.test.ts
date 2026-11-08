import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { File as ExpoFile } from 'expo-file-system';
import { Upload } from 'tus-js-client';
import { supabase } from '../../lib/supabase';
import { resumableStorageUpload } from '../../utils/resumableUpload';
import { awaitUploadPreparation } from '../../lib/resumableUploadLifetime';

type Options = ConstructorParameters<typeof Upload>[1];
let mockOptions: Options;
let mockSource: unknown;
const mockPrevious = jest.fn();
const mockResume = jest.fn();
const mockStart = jest.fn();
const mockAbort = jest.fn();
jest.mock('../../lib/supabase');
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('tus-js-client', () => ({
  Upload: jest.fn().mockImplementation((source, options) => {
    mockSource = source;
    mockOptions = options;
    return {
      findPreviousUploads: mockPrevious,
      resumeFromPreviousUpload: mockResume,
      start: mockStart,
      abort: mockAbort,
    };
  }),
}));
const originalOS = Platform.OS;
const originalFetch = global.fetch;
const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const options = {
  bucketId: 'post-media',
  objectPath: 'member/event/photo.jpg',
  uri: 'file:///synthetic.jpg',
  contentType: 'image/jpeg',
};
function platform(os: string) {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
}
beforeEach(() => {
  jest.clearAllMocks();
  platform('android');
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://fixture.supabase.co';
  jest.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: { access_token: 'synthetic-token' } },
    error: null,
  } as Awaited<ReturnType<typeof supabase.auth.getSession>>);
  jest.mocked(ExpoFile).mockImplementation(() => ({ exists: true, size: 1024 }) as ExpoFile);
  mockPrevious.mockResolvedValue([]);
  mockAbort.mockReset().mockResolvedValue(undefined);
  mockStart.mockImplementation(() => mockOptions.onSuccess?.({} as never));
  global.fetch = jest.fn().mockRejectedValue(Error('Unexpected network access'));
});
afterEach(() => {
  platform(originalOS);
  global.fetch = originalFetch;
  process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test.each([null, {}])('missing session token prevents file access or upload', async (session) => {
  jest
    .mocked(supabase.auth.getSession)
    .mockResolvedValueOnce({ data: { session }, error: null } as Awaited<
      ReturnType<typeof supabase.auth.getSession>
    >);
  await expect(resumableStorageUpload(options)).rejects.toThrow('Your session expired');
  expect(ExpoFile).not.toHaveBeenCalled();
  expect(mockStart).not.toHaveBeenCalled();
});

test.each([
  { exists: false, size: 1024 },
  { exists: true, size: 0 },
])('unreadable native source rejects: %j', async (file) => {
  jest.mocked(ExpoFile).mockImplementationOnce(() => file as ExpoFile);
  await expect(resumableStorageUpload(options)).rejects.toThrow('selected media could not be read');
  expect(mockStart).not.toHaveBeenCalled();
});

test.each(['android', 'ios'])(
  '%s upload binds session, exact object and bounded chunk/retry settings',
  async (os) => {
    platform(os);
    await resumableStorageUpload(options);
    expect(mockSource).toEqual({
      uri: options.uri,
      name: 'photo.jpg',
      type: 'image/jpeg',
      size: 1024,
    });
    expect(mockOptions).toMatchObject({
      endpoint: 'https://fixture.storage.supabase.co/storage/v1/upload/resumable',
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      headers: { authorization: 'Bearer synthetic-token', 'x-upsert': 'false' },
      metadata: {
        bucketName: options.bucketId,
        objectName: options.objectPath,
        contentType: options.contentType,
      },
      removeFingerprintOnSuccess: true,
      storeFingerprintForResuming: true,
    });
    expect(await mockOptions.fingerprint?.(mockSource as never, mockOptions)).toBe(
      'doji:post-media:member/event/photo.jpg:1024',
    );
    expect(mockResume).not.toHaveBeenCalled();
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  },
);

test('custom storage endpoint retains host and normalizes trailing slash', async () => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321/';
  await resumableStorageUpload({ ...options, upsert: true });
  expect(mockOptions.endpoint).toBe('http://127.0.0.1:54321/storage/v1/upload/resumable');
  expect(mockOptions.headers?.['x-upsert']).toBe('true');
});

test('resume chooses the newest matching previous upload before starting', async () => {
  const old = { creationTime: '2026-01-01', uploadUrl: 'https://synthetic.invalid/old' };
  const recent = { creationTime: '2026-02-01', uploadUrl: 'https://synthetic.invalid/new' };
  mockPrevious.mockResolvedValueOnce([old, recent]);
  await resumableStorageUpload(options);
  expect(mockResume).toHaveBeenCalledWith(recent);
  expect(mockResume.mock.invocationCallOrder[0]).toBeLessThan(
    mockStart.mock.invocationCallOrder[0],
  );
});

test('previous-upload lookup failure never starts a new upload silently', async () => {
  mockPrevious.mockRejectedValueOnce(Error('storage unavailable'));
  await expect(resumableStorageUpload(options)).rejects.toThrow('storage unavailable');
  expect(mockStart).not.toHaveBeenCalled();
});

test('a rejected lookup without an error value is still failure, never a confirmed upload', async () => {
  jest.useFakeTimers();
  mockPrevious.mockRejectedValueOnce(undefined);
  await expect(resumableStorageUpload(options)).rejects.toThrow('Upload could not be completed');
  expect(mockStart).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('native upload construction failure releases its watchdog', async () => {
  jest.useFakeTimers();
  jest.mocked(Upload).mockImplementationOnce(() => {
    throw Error('synthetic native unavailable');
  });
  await expect(resumableStorageUpload(options)).rejects.toThrow('synthetic native unavailable');
  expect(jest.getTimerCount()).toBe(0);
});

test('upload failure is propagated to the caller', async () => {
  mockStart.mockImplementationOnce(() => mockOptions.onError?.(Error('connection lost')));
  await expect(resumableStorageUpload(options)).rejects.toThrow('connection lost');
});

test('progress handles unknown totals and optional callbacks', async () => {
  const progress = jest.fn();
  mockStart.mockImplementationOnce(() => {
    mockOptions.onProgress?.(25, 100);
    mockOptions.onProgress?.(0, 0);
    mockOptions.onSuccess?.({} as never);
  });
  await resumableStorageUpload({ ...options, onProgress: progress });
  expect(progress.mock.calls).toEqual([[0], [0.25], [0]]);
  mockOptions.onProgress?.(99, 100);
  expect(progress).toHaveBeenCalledTimes(3);
  await resumableStorageUpload(options);
  expect(() => mockOptions.onProgress?.(25, 100)).not.toThrow();
});

test.each(['ios', 'android'])(
  '%s stalled transfer stops locally without deleting its resumable upload',
  async (os) => {
    platform(os);
    jest.useFakeTimers();
    mockStart.mockImplementation(() => {});
    const result = jest.fn(),
      failure = jest.fn(),
      progress = jest.fn();
    void resumableStorageUpload({ ...options, onProgress: progress }).then(result, failure);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(failure).toHaveBeenCalledWith(expect.objectContaining({ code: 'DOJI_UPLOAD_STALLED' }));
    expect(mockAbort).toHaveBeenCalledWith(false);
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    mockOptions.onSuccess?.({} as never);
    mockOptions.onProgress?.(100, 100);
    await jest.advanceTimersByTimeAsync(120_000);
    expect(result).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledTimes(1);
    expect(progress.mock.calls).toEqual([[0]]);
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  },
);

test('a late resume lookup cannot start an upload after the caller has timed out', async () => {
  jest.useFakeTimers();
  let resolve!: (value: never[]) => void;
  mockPrevious.mockReturnValue(
    new Promise<never[]>((done) => {
      resolve = done;
    }),
  );
  const failure = jest.fn();
  void resumableStorageUpload(options).catch(failure);
  await jest.advanceTimersByTimeAsync(60_000);
  expect(failure).toHaveBeenCalledTimes(1);
  resolve([]);
  await jest.advanceTimersByTimeAsync(0);
  expect(mockStart).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('only increasing bytes extend the stall window and a successful transfer clears it', async () => {
  jest.useFakeTimers();
  mockStart.mockImplementation(() => {});
  const success = jest.fn(),
    failure = jest.fn();
  void resumableStorageUpload(options).then(success, failure);
  await jest.advanceTimersByTimeAsync(50_000);
  mockOptions.onProgress?.(50, 100);
  await jest.advanceTimersByTimeAsync(50_000);
  expect(failure).not.toHaveBeenCalled();
  mockOptions.onProgress?.(50, 100);
  mockOptions.onProgress?.(10, 100);
  mockOptions.onProgress?.(NaN, 100);
  await jest.advanceTimersByTimeAsync(10_000);
  expect(failure).toHaveBeenCalledTimes(1);
  expect(success).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);

  const work = resumableStorageUpload(options);
  await jest.advanceTimersByTimeAsync(0);
  mockOptions.onSuccess?.({} as never);
  await work;
  expect(jest.getTimerCount()).toBe(0);
});

test.each(['throw', 'reject', 'hang'])(
  'native abort may %s without delaying the local stall result',
  async (kind) => {
    jest.useFakeTimers();
    mockStart.mockImplementation(() => {});
    mockAbort.mockImplementation(() => {
      if (kind === 'throw') throw Error('synthetic abort');
      return kind === 'reject' ? Promise.reject(Error('synthetic abort')) : new Promise(() => {});
    });
    const failure = jest.fn();
    void resumableStorageUpload(options).catch(failure);
    await jest.advanceTimersByTimeAsync(60_000);
    mockOptions.onError?.(Error('late native error'));
    expect(failure).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  },
);

test.each(['progress', 'success'])(
  'a late %s callback after suspension cannot outrun the stall timer',
  async (kind) => {
    jest.useFakeTimers();
    mockStart.mockImplementation(() => {});
    const failure = jest.fn();
    void resumableStorageUpload(options).catch(failure);
    await jest.advanceTimersByTimeAsync(0);
    jest.setSystemTime(Date.now() + 60_001);
    if (kind === 'progress') mockOptions.onProgress?.(100, 100);
    else mockOptions.onSuccess?.({} as never);
    await jest.advanceTimersByTimeAsync(0);
    expect(failure).toHaveBeenCalledTimes(1);
    expect(mockAbort).toHaveBeenCalledWith(false);
    expect(jest.getTimerCount()).toBe(0);
  },
);

test('a stalled session cannot eventually start an upload with late credentials', async () => {
  jest.useFakeTimers();
  let resolve!: (value: unknown) => void;
  jest.mocked(supabase.auth.getSession).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }) as never,
  );
  const failure = jest.fn();
  void resumableStorageUpload(options).catch(failure);
  await jest.advanceTimersByTimeAsync(8_000);
  expect(failure).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'DOJI_COMMAND_AUTH_TIMEOUT' }),
  );
  resolve({ data: { session: { access_token: 'synthetic-late' } } });
  await jest.advanceTimersByTimeAsync(0);
  expect(mockStart).not.toHaveBeenCalled();
  expect(ExpoFile).not.toHaveBeenCalled();
});

test('stalled web media preparation is bounded before any transfer begins', async () => {
  jest.useFakeTimers();
  platform('web');
  let resolve!: (value: unknown) => void;
  jest.mocked(global.fetch).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }) as never,
  );
  const failure = jest.fn();
  void resumableStorageUpload(options).catch(failure);
  await jest.advanceTimersByTimeAsync(12_000);
  expect(failure).toHaveBeenCalledWith(
    expect.objectContaining({ message: expect.stringContaining('preparation took too long') }),
  );
  resolve({ ok: true, blob: async () => ({ size: 123 }) });
  await jest.advanceTimersByTimeAsync(0);
  expect(mockStart).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('preparation settling after suspension cannot begin upload before its expired timer runs', async () => {
  jest.useFakeTimers();
  let resolve!: (value: string) => void;
  const work = awaitUploadPreparation(
    new Promise<string>((done) => {
      resolve = done;
    }),
  );
  const check = expect(work).rejects.toThrow('preparation took too long');
  jest.setSystemTime(Date.now() + 12_001);
  resolve('late file');
  await check;
  expect(jest.getTimerCount()).toBe(0);
});

test('web reads the selected blob rather than accessing native files', async () => {
  platform('web');
  const blob = { size: 2048 };
  jest.mocked(global.fetch).mockResolvedValueOnce({ ok: true, blob: async () => blob } as Response);
  await resumableStorageUpload({ ...options, uri: 'blob:synthetic' });
  expect(global.fetch).toHaveBeenCalledWith('blob:synthetic');
  expect(mockSource).toBe(blob);
  expect(ExpoFile).not.toHaveBeenCalled();
});

test('web read failure never starts transport', async () => {
  platform('web');
  jest.mocked(global.fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response);
  await expect(resumableStorageUpload(options)).rejects.toThrow('Could not read media (404)');
  expect(mockStart).not.toHaveBeenCalled();
});

test('web fingerprint uses an explicit unknown size when unavailable', async () => {
  platform('web');
  jest.mocked(global.fetch).mockResolvedValueOnce({ ok: true, blob: async () => ({}) } as Response);
  await resumableStorageUpload(options);
  expect(await mockOptions.fingerprint?.(mockSource as never, mockOptions)).toBe(
    'doji:post-media:member/event/photo.jpg:unknown',
  );
});

test('resume storage ignores unrelated, missing and corrupt entries and filters exact fingerprints', async () => {
  await resumableStorageUpload(options);
  const storage = mockOptions.urlStorage!;
  const matching = { creationTime: '2026-01-01', uploadUrl: 'https://synthetic.invalid/one' };
  const other = { creationTime: '2026-01-02', uploadUrl: 'https://synthetic.invalid/two' };
  const keys = [
    '@doji/tus-upload:one',
    '@doji/tus-upload:two',
    '@doji/tus-upload:bad',
    '@doji/tus-upload:empty',
  ];
  jest
    .mocked(AsyncStorage.getAllKeys)
    .mockResolvedValueOnce([...keys, 'unrelated'])
    .mockResolvedValueOnce([...keys, 'unrelated']);
  const rows: [string, string | null][] = [
    [keys[0], JSON.stringify({ fingerprint: 'exact', upload: matching })],
    [keys[1], JSON.stringify({ fingerprint: 'other', upload: other })],
    [keys[2], '{bad'],
    [keys[3], null],
  ];
  jest.mocked(AsyncStorage.multiGet).mockResolvedValueOnce(rows).mockResolvedValueOnce(rows);
  expect(await storage.findAllUploads()).toEqual([matching, other]);
  expect(await storage.findUploadsByFingerprint('exact')).toEqual([matching]);
  expect(AsyncStorage.multiGet).toHaveBeenLastCalledWith(keys);
});

test('resume storage round trip saves exact ownership and removes only its key', async () => {
  await resumableStorageUpload(options);
  const storage = mockOptions.urlStorage!;
  const now = jest.spyOn(Date, 'now').mockReturnValue(1234);
  const upload = {
    size: 100,
    metadata: {},
    creationTime: '2026-01-01',
    uploadUrl: 'https://synthetic.invalid/one',
    urlStorageKey: '',
    parallelUploadUrls: null,
  };
  const key = await storage.addUpload('member/a:object', upload);
  expect(key).toBe('@doji/tus-upload:member%2Fa%3Aobject:1234');
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(
    key,
    JSON.stringify({ fingerprint: 'member/a:object', upload: { ...upload, urlStorageKey: key } }),
  );
  await storage.removeUpload(key);
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith(key);
  now.mockRestore();
});
