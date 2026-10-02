// This environment belongs only to local Edge-runtime fixtures, not Expo.
// Reuse the installed Supabase worker declarations; do not invent worker APIs.
import '../../node_modules/@supabase/functions-js/src/edge-runtime.d.ts';

declare global {
  namespace Deno {
    // Only the Deno API used by these probes. Runtime execution remains a
    // separate test; this does not pretend to describe the entire Deno API.
    function serve(handler: (request: Request) => Response | Promise<Response>): unknown;
  }
}
