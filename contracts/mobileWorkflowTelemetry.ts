/** Fixed device-reported categories, never identities, content or authoritative receipts. */
export const workflowPhases = [
  'upload',
  'submit',
  'receipt',
  'feed',
  'profile_read',
  'doji_read',
  'feed_read',
  'social_read',
  'economy_read',
  'avatar_upload',
] as const;
export const workflowOutcomes = ['started', 'confirmed', 'request_failed', 'rendered'] as const;
export type WorkflowPhase = (typeof workflowPhases)[number];
export type WorkflowOutcome = (typeof workflowOutcomes)[number];
export type WorkflowCount = {
  phase: WorkflowPhase;
  outcome: WorkflowOutcome;
  count: number;
  capped: boolean;
};
export type WorkflowBatch = {
  id: string;
  issuedAt: number;
  platform: 'ios' | 'android';
  rows: WorkflowCount[];
};
export function validWorkflowPair(phase: unknown, outcome: unknown): boolean {
  return (
    workflowPhases.some((v) => v === phase) &&
    workflowOutcomes.some((v) => v === outcome) &&
    (outcome !== 'rendered' || phase === 'feed') &&
    (phase !== 'feed' || outcome !== 'confirmed')
  );
}
export function validWorkflowBatch(value: unknown, now: number): value is WorkflowBatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).sort().join(',') !== 'id,issuedAt,platform,rows' ||
    typeof v.id !== 'string' ||
    !/^wf:[a-z0-9:-]{10,180}$/.test(v.id) ||
    !Number.isSafeInteger(v.issuedAt) ||
    !Number.isSafeInteger(now) ||
    (v.issuedAt as number) < now - 300000 ||
    (v.issuedAt as number) > now + 30000 ||
    !['ios', 'android'].includes(v.platform as string) ||
    !Array.isArray(v.rows) ||
    !v.rows.length ||
    v.rows.length > 30
  )
    return false;
  const pairs = new Set<string>();
  return v.rows.every((row) => {
    if (
      !row ||
      typeof row !== 'object' ||
      Array.isArray(row) ||
      Object.keys(row).sort().join(',') !== 'capped,count,outcome,phase' ||
      !validWorkflowPair(row.phase, row.outcome) ||
      !Number.isSafeInteger(row.count) ||
      row.count < 1 ||
      row.count > 15000 ||
      typeof row.capped !== 'boolean'
    )
      return false;
    const key = `${row.phase}:${row.outcome}`;
    if (pairs.has(key)) return false;
    pairs.add(key);
    return true;
  });
}
