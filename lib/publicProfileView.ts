import type { Profile } from '../types/database';
import { FALLBACK_AVATAR_GRADIENT } from '../constants/theme';

export type PublicProfileViewStatus = 'visible' | 'blocked_by_user' | 'not_found';

export type PublicProfileView = {
  status: PublicProfileViewStatus;
  profile: unknown;
};

export function normalizePublicProfile(data: unknown): Profile | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Profile;
  if (!row.id || !row.username) return null;
  if (!Array.isArray(row.avatar_gradient) || row.avatar_gradient.length < 2) {
    row.avatar_gradient = [...FALLBACK_AVATAR_GRADIENT];
  }
  return row;
}

/** Treat the access status as authoritative; never render leaked profile data. */
export function parsePublicProfileView(value: unknown): PublicProfileView {
  if (!value || typeof value !== 'object') return { status: 'not_found', profile: null };
  const row = value as { status?: unknown; profile?: unknown };
  if (row.status === 'blocked_by_user') {
    return { status: 'blocked_by_user', profile: null };
  }
  if (row.status !== 'visible' || !row.profile || typeof row.profile !== 'object') {
    return { status: 'not_found', profile: null };
  }
  return { status: 'visible', profile: row.profile as Profile };
}
