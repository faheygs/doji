import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';
import { resumableStorageUpload } from './resumableUpload';

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
  userEventId: string,
  commandId: string,
  uri: string,
  type: 'photo' | 'front',
): Promise<string> {
  const compressed = await compressImage(uri);
  const filePath = await reservePostMedia(userEventId, commandId, type, 'jpg', 'image/jpeg');
  await resumableStorageUpload({
    bucketId: 'post-media',
    objectPath: filePath,
    uri: compressed,
    contentType: 'image/jpeg',
  });

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

export async function uploadPostVideo(
  userEventId: string,
  commandId: string,
  uri: string,
): Promise<string> {
  const contentType = guessVideoContentType(uri);
  const ext = videoExtForType(contentType, uri);
  const filePath = await reservePostMedia(
    userEventId,
    commandId,
    'video',
    ext,
    contentType,
  );
  await resumableStorageUpload({
    bucketId: 'post-media',
    objectPath: filePath,
    uri,
    contentType,
  });

  const { data } = supabase.storage.from('post-media').getPublicUrl(filePath);
  return data.publicUrl;
}

export async function uploadAvatar(userId: string, uri: string): Promise<string> {
  const compressedUri = await compressImage(uri);
  const filePath = `${userId}/avatar-${Date.now()}.jpg`;
  await resumableStorageUpload({
    bucketId: 'avatars',
    objectPath: filePath,
    uri: compressedUri,
    contentType: 'image/jpeg',
  });

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
  return withAvatarCacheParam(data.publicUrl);
}

export async function removePublicStorageObject(
  bucketId: 'avatars' | 'post-media',
  publicUrl: string,
): Promise<void> {
  const marker = `/storage/v1/object/public/${bucketId}/`;
  const pathStart = publicUrl.indexOf(marker);
  if (pathStart < 0) return;
  const objectPath = decodeURIComponent(
    publicUrl.slice(pathStart + marker.length).split(/[?#]/, 1)[0],
  );
  if (!objectPath) return;
  const { error } = await supabase.storage.from(bucketId).remove([objectPath]);
  if (error) throw error;
}

async function reservePostMedia(
  userEventId: string,
  commandId: string,
  slot: 'photo' | 'front' | 'video',
  extension: string,
  contentType: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('reserve_doji_media_upload', {
    p_user_event_id: userEventId,
    p_idempotency_key: commandId,
    p_slot: slot,
    p_extension: extension,
    p_content_type: contentType,
  });
  if (error) throw error;
  const objectPath = (data as { object_path?: string } | null)?.object_path;
  if (!objectPath) throw new Error('Could not prepare the media upload');
  return objectPath;
}
