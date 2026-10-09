import { describe, expect, it } from 'vitest';
import { createEmployeeSession } from './employee-session';
import { ideaRecord, readIdeaRecord } from './idea-record';
import { validIdeaInput, type IdeaInput } from './idea-command';
import { assertEmployeeRead } from './employee-read-policy';
import { readCaseAssignees } from './business-assignees';
import { ideaId, ideaActor, ideaKey, ideaFixture, ideaOwner } from '../../../tests/idea-fixture';
const input: IdeaInput = {
  id: ideaId,
  key: ideaKey,
  version: 'a'.repeat(32),
  action: 'approved',
  reason: 'Suitable for the challenge pool.',
  revision: 1,
};
async function fixture(caps = { operations_read: true, operator_manage: true }) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  let response: unknown = ideaFixture();
  let delay: (() => Promise<void>) | undefined;
  const controller = createEmployeeSession(
    { independentEmployeeIdentity: true, staffWorkflowEnabled: true },
    {
      origin: 'https://admin.dojipro.com',
      upstream: async (url, init) => {
        if (url.endsWith('/api/session'))
          return Response.json({
            signedIn: true,
            assurance: 'aal2',
            csrf: 'c'.repeat(43),
            operator: { user_id: ideaActor, capabilities: caps },
          });
        if (url.endsWith('/auth/logout')) return Response.json({ signedOut: true });
        const call = JSON.parse(String(init?.body)) as (typeof calls)[number];
        calls.push(call);
        await delay?.();
        return Response.json(
          call.name === 'get_admin_case_ownership_v1' ? ideaOwner(true) : response,
        );
      },
    },
  );
  await controller.restore();
  return {
    calls,
    controller,
    respond: (value: unknown) => {
      response = value;
    },
    delay: (fn: () => Promise<void>) => {
      delay = fn;
    },
  };
}
const signal = () => new AbortController().signal;
describe('employee Community Ideas', () => {
  it('projects bounded data, preserves submitted choices and rejects mixed records', () => {
    const value = ideaFixture();
    expect(ideaRecord({ ...value, secret: 'not retained' }, ideaId)).not.toHaveProperty('secret');
    expect(ideaRecord(value, ideaId).options).toEqual(['Walking', 'Cycling']);
    expect(() => ideaRecord({ ...value, id: ideaKey }, ideaId)).toThrow();
    expect(() => ideaRecord({ ...value, allowed_actions: ['delete'] }, ideaId)).toThrow();
    expect(ideaRecord({ ...value, options: ['Only one'] }, ideaId).supported).toBe(false);
    expect(
      ideaRecord(
        {
          ...value,
          kind: 'format_question',
          options: { answer_rule: { type: 'exact_word_count', count: 10 } },
        },
        ideaId,
      ).supported,
    ).toBe(true);
  });
  it('allows only the exact read route and checks source/ownership agreement', async () => {
    expect(() =>
      assertEmployeeRead('/portal/admin/editorial-item?kind=suggestions&id=' + ideaId, false),
    ).not.toThrow();
    expect(() => assertEmployeeRead('/portal/admin/editorial-command', false)).toThrow();
    expect(() =>
      assertEmployeeRead(
        '/portal/admin/editorial-item?kind=suggestions&id=' + ideaId + '&actor=other',
        false,
      ),
    ).toThrow();
    const f = await fixture();
    expect((await readIdeaRecord(f.controller, ideaId, signal())).owner.assignedTo).toBe(ideaActor);
    f.respond({ ...ideaFixture(), version: 'b'.repeat(32) });
    await expect(readIdeaRecord(f.controller, ideaId, signal())).rejects.toThrow();
    await f.controller.signOut();
  });
  it('keeps assignment field-free and binds its receipt', async () => {
    const f = await fixture({ operations_read: true, operator_manage: false });
    f.respond({
      kind: 'suggestion',
      id: ideaId,
      revision: 2,
      assigned_to: ideaActor,
      replayed: false,
    });
    await f.controller.reviewIdea({ ...input, action: 'claim', reason: '' }, signal());
    expect(f.calls[0]).toMatchObject({
      name: 'admin_case_ownership_command_v1',
      args: { p_kind: 'suggestion', p_target: null, p_action: 'claim', p_revision: 1 },
    });
    expect(f.calls[0]?.args).not.toHaveProperty('p_reason');
    f.respond({
      kind: 'suggestion',
      id: ideaKey,
      revision: 2,
      assigned_to: ideaActor,
      replayed: false,
    });
    await expect(
      f.controller.reviewIdea({ ...input, action: 'claim', reason: '' }, signal()),
    ).rejects.toThrow('verified');
    await f.controller.signOut();
  });
  it('uses one existing editorial command and accepts a replay current-item response', async () => {
    const f = await fixture();
    // The current item may have been subsequently reopened; replay is not a new approval.
    await f.controller.reviewIdea(input, signal());
    expect(f.calls).toEqual([
      {
        name: 'admin_editorial_command_v1',
        args: {
          p_kind: 'suggestions',
          p_action: 'approved',
          p_id: ideaId,
          p_version: input.version,
          p_input: {},
          p_reason: input.reason,
          p_idempotency_key: ideaKey,
        },
      },
    ]);
    f.respond({
      id: ideaId,
      kind: 'suggestions',
      action: 'approved',
      outcome: 'saved',
      version: input.version,
      item_unavailable: true,
    });
    await expect(f.controller.reviewIdea(input, signal())).resolves.toMatchObject({
      recorded: true,
    });
    f.respond({
      id: ideaKey,
      kind: 'suggestions',
      action: 'approved',
      outcome: 'saved',
      version: input.version,
      item_unavailable: true,
    });
    await expect(f.controller.reviewIdea(input, signal())).rejects.toThrow();
    await f.controller.signOut();
  });
  it('binds manager reassignment to its target and rejects malformed targets or receipts', async () => {
    const f = await fixture();
    const assignment = { ...input, action: 'assign', target: ideaKey, reason: '' } as const;
    f.respond({
      kind: 'suggestion',
      id: ideaId,
      revision: 2,
      assigned_to: ideaKey,
      replayed: true,
    });
    await f.controller.reviewIdea(assignment, signal());
    expect(f.calls[0]).toMatchObject({
      name: 'admin_case_ownership_command_v1',
      args: { p_kind: 'suggestion', p_action: 'assign', p_target: ideaKey, p_request_id: ideaKey },
    });
    for (const invalid of [
      { ...assignment, target: '' },
      { ...assignment, target: undefined },
      { ...assignment, action: 'claim' },
      { ...assignment, reason: 'unnecessary' },
    ])
      expect(validIdeaInput(invalid as IdeaInput)).toBe(false);
    f.respond({
      kind: 'suggestion',
      id: ideaId,
      revision: 2,
      assigned_to: ideaActor,
      replayed: false,
    });
    await expect(f.controller.reviewIdea(assignment, signal())).rejects.toThrow('verified');
    await f.controller.signOut();
    const denied = await fixture({ operations_read: true, operator_manage: false });
    await expect(denied.controller.reviewIdea(assignment, signal())).rejects.toThrow('permission');
    await expect(
      readCaseAssignees(denied.controller, 'suggestion', ideaId, null, signal()),
    ).rejects.toThrow('permission');
    expect(denied.calls).toEqual([]);
    await denied.controller.signOut();
  });
  it('reads only eligible reviewers for this idea, without business access', async () => {
    const f = await fixture();
    f.respond({ items: [{ id: ideaKey, label: 'Eligible reviewer' }], next_cursor: null });
    expect(
      (await readCaseAssignees(f.controller, 'suggestion', ideaId, null, signal())).items,
    ).toHaveLength(1);
    expect(f.calls).toEqual([
      {
        name: 'get_admin_case_assignees_v1',
        args: {
          p_kind: 'suggestion',
          p_id: ideaId,
          p_after_id: null,
          p_limit: 25,
        },
      },
    ]);
    await f.controller.signOut();
  });
  it('denies unauthorized writes and malformed input without dispatch', async () => {
    const f = await fixture({ operations_read: true, operator_manage: false });
    await expect(f.controller.reviewIdea(input, signal())).rejects.toThrow('permission');
    expect(f.calls).toEqual([]);
    expect(validIdeaInput({ ...input, reason: '' })).toBe(false);
    expect(validIdeaInput({ ...input, version: '3' })).toBe(false);
    expect(validIdeaInput({ ...input, action: 'claim', reason: 'not field free' })).toBe(false);
    expect(validIdeaInput({ ...input, actor: ideaActor } as IdeaInput)).toBe(false);
    await f.controller.signOut();
  });
  it('fences late outcomes after logout', async () => {
    const f = await fixture();
    let release = () => {};
    f.delay(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const pending = f.controller.reviewIdea(input, signal());
    while (!f.calls.length) await new Promise((resolve) => setTimeout(resolve, 0));
    const denied = expect(pending).rejects.toThrow();
    const logout = f.controller.signOut();
    release();
    await denied;
    await logout;
    expect(f.controller.getSnapshot().cache).toBeNull();
  });
});
