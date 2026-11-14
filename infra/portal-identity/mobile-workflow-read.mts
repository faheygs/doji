import { validWorkflowPair } from '../../contracts/mobileWorkflowTelemetry.ts';
import type { WorkflowCount } from '../../contracts/mobileWorkflowTelemetry.ts';
import { record } from './portal-contracts.mts';

export type MobileWorkflowRow = WorkflowCount & {
  platform: 'ios' | 'android';
  received_at: string;
};
export type MobileWorkflowRead = {
  status: 'disabled' | 'unavailable' | 'ready';
  checked_at: string | null;
  rows: MobileWorkflowRow[];
};
const time = (v: unknown) => (typeof v === 'string' && v.length <= 40 ? Date.parse(v) : NaN);

/** Fixed device counts only. No actor/admission hashes or arbitrary database fields escape. */
export function mobileWorkflowRead(value: unknown): MobileWorkflowRead {
  const empty: MobileWorkflowRead = { status: 'unavailable', checked_at: null, rows: [] };
  if (!record(value) || value.source !== 'device_reported') return empty;
  if (value.enabled === false) return { ...empty, status: 'disabled' };
  const checked = time(value.checked_at);
  if (
    value.enabled !== true ||
    !Number.isFinite(checked) ||
    !Array.isArray(value.rows) ||
    value.rows.length > 60
  )
    return empty;
  const oldestHour = Math.floor(checked / 3600000) * 3600000 - 23 * 3600000;
  const rows = new Map<string, MobileWorkflowRow>();
  for (const row of value.rows) {
    if (!record(row)) return empty;
    const count = row.count as number,
      received = time(row.received_at);
    if (
      (row.platform !== 'ios' && row.platform !== 'android') ||
      !validWorkflowPair(row.phase, row.outcome) ||
      !Number.isSafeInteger(count) ||
      count < 1 ||
      count > 24000000000 ||
      typeof row.capped !== 'boolean' ||
      !(received >= oldestHour && received <= checked)
    )
      return empty;
    const key = `${row.platform}:${row.phase}:${row.outcome}`;
    if (rows.has(key)) return empty;
    rows.set(key, {
      platform: row.platform,
      phase: row.phase as WorkflowCount['phase'],
      outcome: row.outcome as WorkflowCount['outcome'],
      count,
      capped: row.capped,
      received_at: row.received_at as string,
    });
  }
  return {
    status: 'ready',
    checked_at: value.checked_at as string,
    rows: [...rows.values()],
  };
}
