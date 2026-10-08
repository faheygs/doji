// Pure read handoffs with synthetic records. No DOM, credentials or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowReview } from '../website/admin-portal/workflow-review.mts';
import type { CaseDetail, AppealDetail, WorkItem } from '../website/portal-contracts.d.mts';
import type { WorkKind } from '../website/admin-portal/workflow-contracts.mts';

function fixture() {
  const calls: string[] = [], opened: WorkItem[] = [];
  const state = { epoch: 1, active: true };
  const report: CaseDetail = { id: 'report', case_contract_version: 3 };
  const appeal: AppealDetail = { case_contract_version: 3, original_decision: {}, report_case: report,
    appeal: { id: 'appeal', report_id: 'report', decision_id: 'decision', submitted_at: '', statement: 'Review', status: 'pending' } };
  const options: Parameters<typeof workflowReview>[0] = {
    epoch: () => state.epoch, active: () => state.active,
    business: Promise.resolve({ open: async id => { calls.push(`business:${id}`); } }),
    privacy: Promise.resolve({ open: async id => { calls.push(`privacy:${id}`); } }),
    intake: { open: async id => { calls.push(`intake:${id}`); } },
    idea: { open: async (kind, id) => { calls.push(`${kind}:${id}`); } },
    report: async id => { calls.push(`report:${id}`); return report; },
    appeal: async id => { calls.push(`appeal:${id}`); return appeal; },
    drawer: item => { opened.push(item); },
  };
  return { options, calls, opened, report, appeal, state };
}

for (const [kind, expected] of [
  ['business_application', 'business:case'], ['business_privacy', 'privacy:case'],
  ['external_intake', 'intake:case'], ['suggestion', 'suggestions:case'],
] as const) test(`${kind} opens only its authorized domain surface`, async () => {
  const f = fixture();
  await workflowReview(f.options)({ kind, id: 'case' });
  assert.deepEqual(f.calls, [expected]);
  assert.deepEqual(f.opened, []);
});

for (const kind of ['business_application', 'business_privacy', 'external_intake', 'suggestion'] as const)
  test(`${kind} unavailable module fails without fallback or writes`, async () => {
    const f = fixture();
    f.options.business = f.options.privacy = Promise.resolve(null);
    delete f.options.intake; f.options.idea = null;
    await assert.rejects(workflowReview(f.options)({ kind, id: 'case' }), /unavailable/);
    assert.deepEqual(f.calls, []); assert.deepEqual(f.opened, []);
  });

test('signed-out entry never invokes a reader', async () => {
  const f = fixture(); f.state.active = false;
  await assert.rejects(workflowReview(f.options)({ kind: 'report', id: 'report' }), /session changed/);
  assert.deepEqual(f.calls, []);
});

for (const kind of ['business_application', 'business_privacy', 'report', 'appeal'] as const)
  for (const transition of ['epoch', 'lock'] as const)
    test(`${kind} ignores a read/module completing after ${transition}`, async () => {
      const f = fixture();
      const transitionNow = () => { if (transition === 'epoch') f.state.epoch++; else f.state.active = false; };
      if (kind.startsWith('business')) {
        const pending = Promise.resolve().then(() => { transitionNow(); return { open: async () => { f.calls.push('opened'); } }; });
        f.options.business = f.options.privacy = pending;
      } else if (kind === 'report') f.options.report = async () => { transitionNow(); return f.report; };
      else f.options.appeal = async () => { transitionNow(); return f.appeal; };
      await assert.rejects(workflowReview(f.options)({ kind, id: kind }), /session changed/);
      assert.deepEqual(f.opened, []); assert.ok(!f.calls.includes('opened'));
    });

for (const field of ['contract', 'reportId', 'appealId', 'appealReportId'] as const)
  test(`mismatched ${field} never opens evidence`, async () => {
    const f = fixture();
    if (field === 'contract') f.report.case_contract_version = 2;
    if (field === 'reportId') f.report.id = 'other';
    if (field === 'appealId') f.appeal.appeal.id = 'other';
    if (field === 'appealReportId') f.appeal.appeal.report_id = 'other';
    const kind: WorkKind = field.startsWith('appeal') ? 'appeal' : 'report';
    await assert.rejects(workflowReview(f.options)({ kind, id: kind }), /identity mismatch/);
    assert.deepEqual(f.opened, []);
  });

for (const kind of ['report', 'appeal'] as const)
  for (const populated of [false, true]) test(`${kind} maps verified ${populated ? 'complete' : 'sparse'} evidence`, async () => {
    const f = fixture();
    if (populated) {
      Object.assign(f.report, { subject: 'Synthetic subject', status: 'reviewing',
        created_at: '2026-10-01T01:00:00Z', triage_state: { queue: 'restricted_safety' } });
      f.appeal.appeal.submitted_at = '2026-10-02T01:00:00Z';
    }
    await workflowReview(f.options)({ kind, id: kind });
    assert.equal(f.opened.length, 1);
    const item = f.opened[0]!;
    assert.equal(item.id, kind);
    assert.equal(item.queue, populated ? 'safety' : 'moderation');
    assert.equal(item.subject, kind === 'appeal' ? 'Moderation appeal' : populated ? 'Synthetic subject' : 'Content report');
    assert.equal(item.status, kind === 'appeal' ? 'appeal' : populated ? 'reviewing' : 'pending');
    assert.equal(item.submitted === 'Time unavailable', !populated);
    assert.equal(item.category, kind === 'appeal' ? 'Appeal' : 'Report');
    assert.deepEqual(f.calls, [`${kind}:${kind}`]);
    assert.equal(Boolean(item.appeal), kind === 'appeal');
  });

test('report read rejection propagates and never opens a partial case', async () => {
  const f = fixture(); f.options.report = async () => { throw Error('Synthetic read failed'); };
  await assert.rejects(workflowReview(f.options)({ kind: 'report', id: 'report' }), /read failed/);
  assert.deepEqual(f.opened, []);
});
