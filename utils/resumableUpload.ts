import AsyncStorage from '@react-native-async-storage/async-storage';
import { File as ExpoFile } from 'expo-file-system';
import { Platform } from 'react-native';
import * as tus from 'tus-js-client';
import { supabase } from '../lib/supabase';

const TUS_CHUNK_BYTES = 6 * 1024 * 1024;
const TUS_STORAGE_PREFIX = '@doji/tus-upload:';

type StoredUpload = {
  fingerprint: string;
  upload: PreviousUpload;
};

type TusUrlStorage = NonNullable<(typeof tus.defaultOptions)['urlStorage']>;
type PreviousUpload = Awaited<ReturnType<TusUrlStorage['findAllUploads']>>[number];

const urlStorage: TusUrlStorage = {
  async findAllUploads() {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
      key.startsWith(TUS_STORAGE_PREFIX),
    );
    const values = await AsyncStorage.multiGet(keys);
    return values.flatMap(([, value]) => {
      if (!value) return [];
      try {
        return [(JSON.parse(value) as StoredUpload).upload];
      } catch {
        return [];
      }
    });
  },
  async findUploadsByFingerprint(fingerprint) {
    const allKeys = (await AsyncStorage.getAllKeys()).filter((key) =>
      key.startsWith(TUS_STORAGE_PREFIX),
    );
    const values = await AsyncStorage.multiGet(allKeys);
    return values.flatMap(([, value]) => {
      if (!value) return [];
      try {
        const stored = JSON.parse(value) as StoredUpload;
        return stored.fingerprint === fingerprint ? [stored.upload] : [];
      } catch {
        return [];
      }
    });
  },
  async removeUpload(urlStorageKey) {
    await AsyncStorage.removeItem(urlStorageKey);
  },
  async addUpload(fingerprint, upload) {
    const key = `${TUS_STORAGE_PREFIX}${encodeURIComponent(fingerprint)}:${Date.now()}`;
    const value: StoredUpload = { fingerprint, upload: { ...upload, urlStorageKey: key } };
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return key;
  },
};

function directStorageEndpoint(): string {
  const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const directUrl = projectUrl.includes('.supabase.co')
    ? projectUrl.replace('.supabase.co', '.storage.supabase.co')
    : projectUrl;
  return `${directUrl.replace(/\/$/, '')}/storage/v1/upload/resumable`;
}

async function uploadSource(uri: string, contentType: string, objectPath: string) {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) throw new Error(`Could not read media (${response.status})`);
    return response.blob();
  }

  const file = new ExpoFile(uri);
  if (!file.exists || !file.size) throw new Error('The selected media could not be read');
  return {
    uri,
    name: objectPath.split('/').at(-1) ?? 'upload',
    type: contentType,
    size: file.size,
  } as unknown as File;
}

export async function resumableStorageUpload(options: {
  bucketId: string;
  objectPath: string;
  uri: string;
  contentType: string;
  upsert?: boolean;
  onProgress?: (fraction: number) => void;
}): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Your session expired. Please sign in again.');

  const source = await uploadSource(options.uri, options.contentType, options.objectPath);
  const fingerprint = [
    'doji',
    options.bucketId,
    options.objectPath,
    (source as { size?: number }).size ?? 'unknown',
  ].join(':');

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(source, {
      endpoint: directStorageEndpoint(),
      chunkSize: TUS_CHUNK_BYTES,
      retryDelays: [0, 1_000, 3_000, 5_000, 10_000, 20_000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        'x-upsert': options.upsert ? 'true' : 'false',
      },
      metadata: {
        bucketName: options.bucketId,
        objectName: options.objectPath,
        contentType: options.contentType,
        cacheControl: '31536000',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      storeFingerprintForResuming: true,
      urlStorage,
      fingerprint: async () => fingerprint,
      onProgress: (uploaded, total) => options.onProgress?.(total ? uploaded / total : 0),
      onError: reject,
      onSuccess: () => resolve(),
    });

    void upload
      .findPreviousUploads()
      .then((previous) => {
        const latest = previous.sort((a, b) =>
          b.creationTime.localeCompare(a.creationTime),
        )[0];
        if (latest) upload.resumeFromPreviousUpload(latest);
        upload.start();
      })
      .catch(reject);
  });
}
