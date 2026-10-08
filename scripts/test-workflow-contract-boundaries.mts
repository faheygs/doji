import test from 'node:test';
import assert from 'node:assert/strict';
import { assignees, ownership, workPage, workKinds, label } from '../website/admin-portal/workflow-contracts.mts';
const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const at = '2026-10-08T01:00:00Z';
const ref = { kind: 'suggestion', id } as const;
const owner = { ...ref, revision: 0, source_version: 'v1', owner_label: 'Unassigned', assigned_to: null,
  can_claim: true, can_release: false, can_assign: false, can_decide: false, actionable: true };

test('ownership rejects malformed versions, identities and capabilities', () => {
  assert.deepEqual(ownership(owner, ref), owner);
  assert.equal(ownership({ ...owner, assigned_to: id }, ref).assigned_to, id);
  for (const value of [null, [], { ...owner, id: 'other' }, { ...owner, kind: 'report' },
    ...[-1, .5, Number.MAX_SAFE_INTEGER + 1, '1'].map(revision => ({ ...owner, revision })),
    ...[null, '', 'x'.repeat(65)].map(source_version => ({ ...owner, source_version })),
    { ...owner, owner_label: null }, { ...owner, assigned_to: 'invalid' },
    ...['can_claim', 'can_release', 'can_assign', 'can_decide', 'actionable'].map(key => ({ ...owner, [key]: 'true' }))])
    assert.throws(() => ownership(value, ref), /could not be verified/);
});

test('assignee directory validates the whole bounded page before returning it', () => {
  assert.deepEqual(assignees({ items: [], next_cursor: null }), { items: [], next_cursor: null });
  const page = { items: [{ id, label: 'Synthetic employee' }], next_cursor: id };
  assert.deepEqual(assignees(page), page);
  for (const value of [null, { items: null }, { items: Array(26).fill(page.items[0]), next_cursor: null },
    ...[null, { id: 'bad', label: 'Name' }, { id, label: null }].map(item => ({ items: [item], next_cursor: null })),
    { ...page, next_cursor: 'bad' }]) assert.throws(() => assignees(value), /could not be verified/);
});

test('queue accepts each authorized source, never duplicates or cross-scope rows', () => {
  for (const kind of workKinds) {
    const row = { kind, id, key: `${kind}:${id}`, subject: label(kind), at, work_state: 'ready',
      assigned_to: null, due_at: null, ownership_model: kind === 'report' ? 'existing_report'
        : kind === 'external_intake' ? 'existing_intake' : 'staff_workflow' };
    const page = { scope: 'staff_inbox_v1', order: 'oldest_first', items: [row], authorized_queues: [kind], next_cursor: { at, key: row.key } };
    assert.deepEqual(workPage(page).items, [row]);
    for (const value of [{ ...page, items: [row, row] }, { ...page, authorized_queues: [] },
      { ...page, authorized_queues: [kind, kind] }, { ...page, authorized_queues: ['unknown'] },
      { ...page, next_cursor: { at, key: 'other' } }, { ...page, next_cursor: { at: 'old', key: row.key } },
      { ...page, next_cursor: 1 }, { ...page, items: [], next_cursor: {} }])
      assert.throws(() => workPage(value), /could not be verified/);
    for (const patch of [{ id: 'bad' }, { key: 'wrong' }, { kind: 'bad' }, { subject: null },
      { subject: 'x'.repeat(121) }, { at: null }, { at: 'bad' }, { work_state: 'closed' },
      { due_at: 42 }, { due_at: 'bad' }, { ownership_model: 'invented' }, { assigned_to: 'bad' }])
      assert.throws(() => workPage({ ...page, items: [{ ...row, ...patch }] }), /could not be verified/);
  }
});

test('safety page enforces area, closed filter, origin and permitted source kinds', () => {
  for (const kind of ['report', 'appeal', 'external_intake'] as const) for (const closed of [false, true]) {
    const row = { kind, id, key: `${kind}:${id}`, subject: label(kind), at, work_state: closed ? 'closed' : 'waiting',
      assigned_to: id, due_at: at, ownership_model: kind === 'report' ? 'existing_report' : kind === 'external_intake' ? 'existing_intake' : 'staff_workflow',
      origin: kind === 'external_intake' ? 'external' : 'in_app', status: 'received' };
    const filter = { queue: 'restricted_safety', closed };
    const page = { scope: 'staff_safety_v1', ...filter, order: 'oldest_first', items: [row], authorized_queues: [kind], next_cursor: null };
    assert.deepEqual(workPage(page, filter).items, [row]);
    for (const value of [{ ...page, queue: 'moderation' }, { ...page, closed: !closed },
      { ...page, items: [{ ...row, origin: 'wrong' }] }, { ...page, items: [{ ...row, status: null }] },
      { ...page, items: [{ ...row, status: 'x'.repeat(41) }] },
      { ...page, authorized_queues: ['suggestion'], items: [{ ...row, kind: 'suggestion', key: `suggestion:${id}` }] }])
      assert.throws(() => workPage(value, filter), /could not be verified/);
  }
});
