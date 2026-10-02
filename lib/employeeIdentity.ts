import type { Session } from '@supabase/supabase-js';

// Auth's server-owned role, never editable user_metadata, identifies staff.
export function isEmployeeSession(session: Session | null): boolean {
  return session?.user?.role === 'doji_employee';
}
