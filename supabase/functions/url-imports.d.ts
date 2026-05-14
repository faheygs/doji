/**
 * Workspace `tsc` cannot resolve Deno URL imports. The Edge runtime still loads esm.sh.
 * Return type is intentionally loose so `.from(...).update()` is not inferred as `never`.
 */
declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: Record<string, unknown>,
  ): import('@supabase/supabase-js').SupabaseClient;

  export type SupabaseClient = import('@supabase/supabase-js').SupabaseClient;
}
