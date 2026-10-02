// Employee-only server requests. Opaque API keys are not session JWTs: the
// gateway authenticates them through apikey, not Authorization: Bearer.
// Legacy service-role JWTs remain supported for the local Auth test stack.
export function employeeServiceHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    'content-type': 'application/json',
    ...(serviceKey.startsWith('sb_secret_') ? {} : { authorization: `Bearer ${serviceKey}` }),
  };
}
