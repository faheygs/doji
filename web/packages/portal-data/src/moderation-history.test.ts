import { expect, it } from 'vitest';
import { reportHistory, appealHistory } from './moderation-history';
import { reportRecord, appealRecord } from './moderation-record';
import { caseFingerprint } from '../../../apps/admin/src/connected/ModerationFields';
import {
  reportFixture,
  reportId,
  appealFixture,
  appealId,
} from '../../../tests/moderation-fixture';
it('projects bounded workflow and separate access summaries without raw audit metadata', () => {
  const result = reportHistory({
    workflow_history: [
      {
        action: 'report.claimed',
        occurred_at: '2026-10-09T12:00:00Z',
        actor: { display_name: 'Reviewer', email: 'secret' },
        reason: '<b>Literal</b>',
        metadata: { secret: 'private' },
      },
      { action: 'report.evidence_viewed' },
    ],
    evidence_access: { view_count: 5, last_viewed_at: 'bad', last_viewer: null, secret: 'private' },
  });
  expect(result.workflow).toHaveLength(1);
  expect(result.workflow?.[0]?.reason).toBe('<b>Literal</b>');
  expect(result.access).toEqual({ count: 5, at: null, actor: 'Reviewer unavailable' });
  expect(JSON.stringify(result)).not.toMatch(/secret|private|email|metadata/);
  expect(reportHistory({})).toEqual({ workflow: null, access: null });
  expect(reportHistory({ workflow_history: [] }).workflow).toEqual([]);
});
it('rejects oversized or malformed history rather than caching opaque values', () => {
  for (const input of [
    { workflow_history: Array(51).fill({ action: 'report.claimed' }) },
    { workflow_history: [null] },
    { workflow_history: [{ action: 'report.claimed', reason: 'x'.repeat(12001) }] },
    { workflow_history: [{ action: 'report.claimed', actor: { display_name: 'x'.repeat(201) } }] },
    { evidence_access: { view_count: -1 } },
    { evidence_access: { view_count: 1.5 } },
  ])
    expect(() => reportHistory(input)).toThrow();
});
it('preserves missing legacy appeal dates and reviewer identity without substituting current history', () => {
  const value = appealFixture();
  const result = appealHistory({
    ...value,
    original_decision: { ...value.original_decision, decided_at: 'invalid', decider_deleted: true },
  });
  expect(result).toMatchObject({
    decidedAt: null,
    originalReviewer: 'Deleted employee',
    reviewedAt: null,
    reviewer: 'Reviewer unavailable',
  });
});
it('access counters do not invalidate decisions, but changed evidence and appeal eligibility do', () => {
  const source = reportFixture();
  const report = reportRecord(source, reportId);
  const item = { report, appeal: null, restricted: false, owner: null };
  const key = caseFingerprint(item);
  const changed = reportRecord(
    {
      ...source,
      evidence_access: { view_count: 2 },
    },
    reportId,
  );
  expect(caseFingerprint({ ...item, report: changed })).toBe(key);
  expect(
    caseFingerprint({
      ...item,
      report: {
        ...changed,
        history: reportHistory({ workflow_history: [{ action: 'report.reopened' }] }),
      },
    }),
  ).not.toBe(key);
  expect(
    caseFingerprint({
      ...item,
      report: { ...changed, evidence: { ...changed.evidence, caption: 'Changed' } },
    }),
  ).not.toBe(key);
  const appeal = appealRecord(appealFixture(), appealId);
  expect(caseFingerprint({ ...item, appeal })).not.toBe(
    caseFingerprint({ ...item, appeal: { ...appeal, canReview: false } }),
  );
});
