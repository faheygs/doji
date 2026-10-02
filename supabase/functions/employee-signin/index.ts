/// <reference path="../deno.d.ts" />
import { signInEmployee } from '../_shared/employee-signin.ts';
Deno.serve((request) => signInEmployee(request, {
  enabled: Deno.env.get('EMPLOYEE_SIGNIN_ENABLED') === 'true',
  origin: Deno.env.get('EMPLOYEE_PORTAL_ORIGIN') || '',
  supabaseUrl: Deno.env.get('SUPABASE_URL') || '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') || '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
}));
