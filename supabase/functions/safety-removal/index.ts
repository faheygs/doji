/// <reference path="../deno.d.ts" />
import { safetyRemoval } from '../_shared/safety-removal.ts';
Deno.serve(request => safetyRemoval(request, {
  enabled:Deno.env.get('SAFETY_REMOVAL_ENABLED')==='true',
  origin:Deno.env.get('SAFETY_REMOVAL_ORIGIN')||'',
  supabaseUrl:Deno.env.get('SUPABASE_URL')||'',
  serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',
  turnstileSecret:Deno.env.get('SAFETY_TURNSTILE_SECRET')||'',
}));
