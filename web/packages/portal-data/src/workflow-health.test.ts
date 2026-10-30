import { describe, expect, it } from 'vitest';
import { cleanupNames, workflowSnapshot } from './workflow-health';

const fixture = () => ({
  available: true,
  enabled: true,
  retention_enabled: false,
  observed_at: '2026-10-30T16:30:00Z',
  hours: [
    {
      workflow: 'maintenance',
      outcome: 'failed',
      hour: '2026-10-30T16:00:00Z',
      attempts: 2,
      elapsed_ms: 12,
      counts: { deleted_post_media: 1 },
    },
  ],
  receipts: [
    {
      workflow: 'maintenance',
      outcome: 'failed',
      observed_at: '2026-10-30T16:29:00Z',
      phase: 'post_media',
      counts: { deleted_post_media: 1 },
    },
  ],
  scheduler_receipt: null,
});
describe('workflow monitoring projection', () => {
  it('labels account cleanup receipts as accounts, not a count of individual media objects', () => {
    expect(cleanupNames.deleted_account_media).toBe('Deleted-account cleanups completed');
  });
  it('retains confirmed partial cleanup, excludes private fields, and preserves disabled retention', () => {
    const raw = fixture();
    const result = workflowSnapshot({
      ...raw,
      secret: 'private',
      receipts: raw.receipts.map((row) => ({
        ...row,
        user: 'private',
        counts: { ...row.counts, password: 'private' },
      })),
    });
    expect(result?.receipts[0]?.counts.deleted_post_media).toBe(1);
    expect(result?.retention_enabled).toBe(false);
    expect(JSON.stringify(result)).not.toContain('private');
    expect(result?.scheduler).toBeNull();
  });
  it('rejects malformed, duplicate and unbounded observations rather than inventing zeroes', () => {
    const raw = fixture();
    for (const patch of [
      undefined,
      {},
      { ...raw, available: false },
      { ...raw, observed_at: 'bad' },
      { ...raw, enabled: null },
      { ...raw, hours: Array(361).fill(raw.hours[0]) },
      { ...raw, hours: [raw.hours[0], raw.hours[0]] },
      { ...raw, receipts: Array(16).fill(raw.receipts[0]) },
      { ...raw, receipts: [raw.receipts[0], raw.receipts[0]] },
      ...['workflow', 'outcome', 'hour', 'attempts', 'elapsed_ms', 'counts'].map((key) => ({
        ...raw,
        hours: [{ ...raw.hours[0], [key]: 'bad' }],
      })),
      { ...raw, hours: [{ ...raw.hours[0], attempts: 0 }] },
      { ...raw, hours: [{ ...raw.hours[0], hour: raw.observed_at }] },
      { ...raw, receipts: [{ ...raw.receipts[0], phase: 'secret' }] },
      { ...raw, receipts: [{ ...raw.receipts[0], counts: { deleted_post_media: -1 } }] },
      { ...raw, scheduler_receipt: {} },
    ])
      expect(workflowSnapshot(patch)).toBeNull();
  });
  it('keeps empty observations distinct from missing coverage and validates scheduler receipts', () => {
    expect(
      workflowSnapshot({ ...fixture(), enabled: false, hours: [], receipts: [] })?.hours,
    ).toEqual([]);
    expect(
      workflowSnapshot({
        ...fixture(),
        scheduler_receipt: {
          observed_at: '2026-10-01T00:00:00Z',
          scanned: 2,
          succeeded_deleted: 1,
          failed_deleted: 0,
          has_more: true,
        },
      })?.scheduler?.has_more,
    ).toBe(true);
  });
});
