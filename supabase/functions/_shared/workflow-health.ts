/// <reference path="../deno.d.ts" />
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
export type Workflow = 'prelive' | 'activate' | 'close' | 'close_targeted' | 'maintenance';
type Phase = 'command' | 'operational_retention' | 'expired_media' | 'committed_intents' |
  'push_endpoints' | 'rate_limits' | 'post_media' | 'account_media' | 'queue_check' | 'scheduler_logs' | 'complete';
const countKeys = new Set(['orphaned_media', 'committed_media_intents', 'stale_push_endpoints',
  'expired_rate_limit_buckets', 'deleted_post_media', 'deleted_account_media',
  'scheduler_succeeded_deleted', 'scheduler_failed_deleted']);
type Rpc = (name: string, args: Record<string, unknown>) => {
  abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }>;
};
export function workflowHealthEnabled() {
  if (Deno.env.get('WORKFLOW_HEALTH_ENABLED') !== 'true') return false;
  const environment = Deno.env.get('DOJI_ENVIRONMENT');
  const project = environment === 'staging' ? 'ohrcupagdoilkwhecict'
    : environment === 'production' ? 'tvixsmqxotuvyjqzmjla' : null;
  return project !== null && Deno.env.get('SUPABASE_URL') === `https://${project}.supabase.co`;
}
export class WorkflowObservation {
  phase: Phase = 'command';
  deferred = false;
  deferredPhase?: Phase;
  private counts: Record<string, number> = {};
  count(key: string, value: number) {
    if (countKeys.has(key) && Number.isSafeInteger(value) && value >= 0 && value <= 999999)
      this.counts[key] = value;
  }
  snapshot() { return { ...this.counts }; }
  defer() { this.deferred = true; this.deferredPhase ??= this.phase; }
}
export async function observeWorkflow(
  workflow: Workflow, rpc: Rpc, work: (observation: WorkflowObservation) => Promise<Response>,
) {
  const observation = new WorkflowObservation();
  const enabled = workflowHealthEnabled();
  if (!enabled && Deno.env.get('WORKFLOW_HEALTH_ENABLED') === 'true')
    console.error('workflow_health_environment_mismatch');
  const started = Date.now();
  let outcome: 'succeeded' | 'failed' | 'deferred' = 'failed';
  try {
    const response = await work(observation);
    outcome = response.ok ? observation.deferred ? 'deferred' : 'succeeded' : 'failed';
    return response;
  } finally {
    if (enabled) {
      // No retry or member-path wait. A killed isolate/missing sidecar is a coverage
      // gap, never an inferred successful workflow. Raw errors are not persisted.
      try {
        if (typeof EdgeRuntime === 'undefined') {
          console.error('workflow_health_observation_unavailable');
        } else {
          const args = { p_workflow: workflow, p_outcome: outcome,
            p_phase: outcome === 'deferred' ? observation.deferredPhase ?? observation.phase : observation.phase,
            p_elapsed_ms: Math.min(900000, Math.max(0, Date.now() - started)),
            p_counts: observation.snapshot() };
          EdgeRuntime.waitUntil(Promise.resolve().then(async () => {
            const result = await rpc('record_workflow_health_v1', args).abortSignal(AbortSignal.timeout(2000));
            if (result.error || result.data !== true) throw Error('Observation not acknowledged');
          }).catch(() => { console.error('workflow_health_observation_unavailable'); }));
        }
      } catch { console.error('workflow_health_observation_unavailable'); }
    }
  }
}

export async function schedulerLogRetention(rpc: Rpc, observation: WorkflowObservation) {
  if (Deno.env.get('SCHEDULER_LOG_RETENTION_ENABLED') !== 'true') return false;
  if (!workflowHealthEnabled()) throw Error('Scheduler retention environment unavailable');
  observation.phase = 'scheduler_logs';
  const { data, error } = await rpc('run_scheduler_log_retention_v1', { p_limit: 500 })
    .abortSignal(AbortSignal.timeout(5000));
  if (error || !data || typeof data !== 'object') throw Error('Scheduler retention unavailable');
  const result = data as Record<string, unknown>;
  if (result.enabled !== true || typeof result.has_more !== 'boolean' ||
    ![result.scanned, result.succeeded_deleted, result.failed_deleted]
      .every(value => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 500))
    throw Error('Scheduler retention not acknowledged');
  observation.count('scheduler_succeeded_deleted', Number(result.succeeded_deleted));
  observation.count('scheduler_failed_deleted', Number(result.failed_deleted));
  return result.has_more;
}
