// Internal primitive only: no deployed endpoint, timer or automatic retry.
// The caller supplies a durable execution ID; database approval selects the user.
import { employeeServiceHeaders } from './employee-service-headers.ts';
export async function executeBusinessErasure(
  config: { enabled: boolean; supabaseUrl: string; serviceKey: string },
  caseId: string,
  executionId: string,
  upstream: typeof fetch = fetch,
): Promise<{ state: string }> {
  if (!config.enabled) return { state: 'disabled' };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(caseId) || !uuid.test(executionId))
    throw Error('Exact case and execution IDs required');
  const origin = new URL(config.supabaseUrl);
  if (
    origin.protocol !== 'https:' &&
    !(origin.protocol === 'http:' && origin.hostname === '127.0.0.1')
  )
    throw Error('Secure service URL required');
  if (
    !config.serviceKey ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw Error('Invalid service configuration');
  const call = (path: string, method: string, body?: unknown) =>
    upstream(`${origin.origin}${path}`, {
      method,
      headers: employeeServiceHeaders(config.serviceKey),
      signal: AbortSignal.timeout(8000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const rpc = async (name: string) => {
    const r = await call(`/rest/v1/rpc/${name}`, 'POST', {
      p_case_id: caseId,
      p_execution_id: executionId,
    });
    if (!r.ok) throw Error('Business erasure requires restricted review');
    return r.json();
  };
  const claim = await rpc('claim_business_erasure_v1');
  if (!uuid.test(claim.account_id)) throw Error('Invalid erasure target');
  if (['primary_erased', 'completed'].includes(claim.state)) return { state: claim.state };
  const path = `/auth/v1/admin/users/${claim.account_id}`;
  const read = async () => {
    const r = await call(path, 'GET');
    const u = await r.json().catch(() => null);
    if (r.status === 404 && (u?.code === 'user_not_found' || u?.error_code === 'user_not_found'))
      return null;
    if (
      !r.ok ||
      u?.id !== claim.account_id ||
      u?.role !== 'doji_business' ||
      u?.app_metadata?.account_type !== 'business'
    )
      throw Error('Exact business identity could not be confirmed');
    return u;
  };
  const user = await read();
  if (user) {
    if (claim.delete_authorized !== true) return { state: 'needs_auth_review' };
    // A timed-out DELETE is ambiguous. A future invocation only reconciles by GET.
    const deleted = await call(path, 'DELETE', { should_soft_delete: false });
    if (!deleted.ok) return { state: 'needs_auth_review' };
    if (await read()) return { state: 'needs_auth_review' };
  }
  return rpc('finish_business_erasure_v1');
}
