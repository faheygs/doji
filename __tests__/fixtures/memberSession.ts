import type { Session } from '@supabase/supabase-js';

export function memberSession(accessToken: string): Session {
  return {
    access_token: accessToken,
    refresh_token: 'synthetic-refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: 'synthetic-member',
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00Z',
    },
  };
}
