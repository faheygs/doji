import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const clean = base64.replace(/\s/g, '');
  const binaryString = globalThis.atob(clean);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/** RN Android often returns an empty/incorrect Blob from fetch(file://.). Read bytes reliably instead. */
export async function readUriAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Could not read file (${response.status})`);
    }
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) {
      throw new Error('File was empty — try again');
    }
    return buffer;
  }

  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });
    const buffer = base64ToArrayBuffer(base64);
    if (!buffer.byteLength) {
      throw new Error('File read failed');
    }
    return buffer;
  } catch {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Could not read file (${response.status})`);
    }
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) {
      throw new Error('File was empty — try again');
    }
    return buffer;
  }
}

/** CDN + disk cache reuse the same object path (`…/avatar.jpg`). Cache-busting keeps avatars visually fresh everywhere. */
function withAvatarCacheParam(publicUrl: string): string {
  const sep = publicUrl.includes('?') ? '&' : '?';
  return `${publicUrl}${sep}v=${Date.now()}`;
}

export async function compressImage(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1200 } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

export async function uploadPostMedia(
  userId: string,
  uri: string,
  type: 'photo' | 'front',
): Promise<string> {
  const compressed = await compressImage(uri);

  const body = await readUriAsArrayBuffer(compressed);

  const fileExt = 'jpg';
  const fileName = `${Date.now()}_${type}.${fileExt}`;
  const filePath = `${userId}/${fileName}`;

  const { error } = await supabase.storage
    .from('post-media')
    .upload(filePath, body, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from('post-media').getPublicUrl(filePath);
  return data.publicUrl;
}

function guessVideoContentType(uri: string): string {
  const path = uri.split('?')[0].toLowerCase();
  if (path.endsWith('.mov') || path.endsWith('.qt')) return 'video/quicktime';
  if (path.endsWith('.webm')) return 'video/webm';
  if (path.endsWith('.m4v')) return 'video/x-m4v';
  return 'video/mp4';
}

function videoExtForType(contentType: string, uri: string): string {
  if (contentType.includes('quicktime') || uri.toLowerCase().includes('.mov')) return 'mov';
  if (contentType.includes('webm')) return 'webm';
  return 'mp4';
}

export async function uploadPostVideo(userId: string, uri: string): Promise<string> {
  const body = await readUriAsArrayBuffer(uri);
  const contentType = guessVideoContentType(uri);
  const ext = videoExtForType(contentType, uri);

  const fileName = `${Date.now()}_video.${ext}`;
  const filePath = `${userId}/${fileName}`;

  const { error } = await supabase.storage.from('post-media').upload(filePath, body, {
    contentType,
    upsert: false,
  });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from('post-media').getPublicUrl(filePath);
  return data.publicUrl;
}

export async function uploadAvatar(userId: string, uri: string): Promise<string> {
  const compressedUri = await compressImage(uri);
  const body = await readUriAsArrayBuffer(compressedUri);

  const filePath = `${userId}/avatar.jpg`;

  const { error } = await supabase.storage
    .from('avatars')
    .upload(filePath, body, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
  return withAvatarCacheParam(data.publicUrl);
}
