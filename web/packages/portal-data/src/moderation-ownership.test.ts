import { expect, it } from 'vitest';
import { createEmployeeSession } from './employee-session';
import {
  validModerationInput,
  moderationRequest,
  moderationReceipt,
  type ModerationInput,
} from './moderation-command-contracts';
import { appealId, moderatorId, decisionId } from '../../../tests/moderation-fixture';
const target = '40000000-0000-4000-8000-000000000004';
const input: ModerationInput = {
  kind: 'ownership',
  action: 'assign',
  id: appealId,
  key: decisionId,
  restricted: false,
  target,
  revision: 2,
  sourceVersion: 'a'.repeat(32),
};
it('requires an exact target for assignment and validates its matching receipt', () => {
  expect(validModerationInput(input)).toBe(true);
  expect(validModerationInput({ ...input, target: 'bad' })).toBe(false);
  expect(validModerationInput({ ...input, action: 'release' })).toBe(false);
  expect(moderationRequest(input).body).toMatchObject({
    p_kind: 'appeal',
    p_target: target,
    p_revision: 2,
  });
  expect(() =>
    moderationReceipt(
      { kind: 'appeal', id: appealId, revision: 3, assigned_to: target, replayed: false },
      input,
      moderatorId,
    ),
  ).not.toThrow();
  expect(() =>
    moderationReceipt(
      { kind: 'appeal', id: appealId, revision: 3, assigned_to: moderatorId, replayed: false },
      input,
      moderatorId,
    ),
  ).toThrow();
});
it('assignment requires manager capability before dispatch and keeps the exact target on repeat', async () => {
  const calls: unknown[] = [];
  const caps = { moderation_read: true, moderation_write: true, operator_manage: false };
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
            operator: { user_id: moderatorId, capabilities: caps },
          });
        calls.push(JSON.parse(String(init?.body)));
        return Response.json({
          kind: 'appeal',
          id: appealId,
          revision: 3,
          assigned_to: target,
          replayed: false,
        });
      },
    },
  );
  await controller.restore();
  await expect(controller.moderate(input, new AbortController().signal)).rejects.toThrow();
  expect(calls).toEqual([]);
  caps.operator_manage = true;
  await controller.restore();
  await controller.moderate(input, new AbortController().signal);
  await controller.moderate(input, new AbortController().signal);
  expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual(calls[1]);
});
