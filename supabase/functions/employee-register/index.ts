/// <reference path="../deno.d.ts" />
import { registerEmployee } from '../_shared/employee-registration.ts';

Deno.serve((request) => registerEmployee(request, {
  enabled: Deno.env.get('EMPLOYEE_REGISTRATION_ENABLED') === 'true',
  origin: Deno.env.get('EMPLOYEE_PORTAL_ORIGIN') || '',
  supabaseUrl: Deno.env.get('SUPABASE_URL') || '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') || '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  enrollmentEmails: Deno.env.get('EMPLOYEE_ENROLLMENT_EMAILS'),
  resendKey: Deno.env.get('RESEND_API_KEY'),
  fromEmail: Deno.env.get('ADMIN_FROM_EMAIL'),
}));
