import type { Profile } from '../types/database';

export type PublicProfileViewStatus = 'visible' | 'blocked_by_user' | 'not_found';

export type PublicProfileView = {
  status: PublicProfileViewStatus;
  profile: unknown;
};

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
