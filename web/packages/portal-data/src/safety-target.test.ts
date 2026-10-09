import { expect, it } from 'vitest';
import { createEmployeeSession } from './employee-session';
import { safetyTarget, readSafetyTarget } from './safety-target';
import { safetyRecord } from './safety-record';
import { validSafetyReport, safetyReportReceipt, type SafetyReportInput } from './safety-report';
import { safetyFixture, safetyId, safetyActor } from '../../../tests/safety-fixture';
import { targetFixture, targetId, linkedReportId } from '../../../tests/safety-target-fixture';
const input: SafetyReportInput = {
  p_id: safetyId,
  p_revision: 1,
  p_command_id: safetyActor,
  p_input: {
    kind: 'post',
    target_id: targetId,
    fingerprint: 'a'.repeat(64),
    note: 'Verified the exact submitted ID.',
  },
};
it('projects only verified target fields and never retains media references or arbitrary metadata', () => {
  const target = targetFixture();
  const result = safetyTarget({ ...target, token: 'secret' }, safetyId, 'post', targetId);
  expect(result.content).toContain('<img');
  expect(result.hasMedia).toBe(true);
  expect(JSON.stringify(result)).not.toMatch(/private\/reference|secret|photo_ref/);
  for (const value of [
    { ...target, id: safetyId },
    { ...target, case_id: targetId },
    { ...target, kind: 'account' },
    { ...target, fingerprint: 'a' },
    { ...target, detail: { text: 'x'.repeat(6001) } },
  ])
    expect(() => safetyTarget(value, safetyId, 'post', targetId)).toThrow();
});
it('requires strict report input and matching exact revision and linked report receipt', () => {
  expect(validSafetyReport(input)).toBe(true);
  expect(validSafetyReport({ ...input, p_input: { ...input.p_input, fingerprint: '' } })).toBe(
    false,
  );
  expect(validSafetyReport({ ...input, p_input: { ...input.p_input, note: 'short' } })).toBe(false);
  expect(validSafetyReport({ ...input, p_revision: Number.MAX_SAFE_INTEGER })).toBe(false);
  const receipt = { id: safetyId, report_id: linkedReportId, revision: 2, outcome: 'saved' };
  expect(safetyReportReceipt(receipt, input).reportId).toBe(linkedReportId);
  for (const value of [
    { ...receipt, report_id: null },
    { ...receipt, id: targetId },
    { ...receipt, revision: 3 },
    { ...receipt, outcome: 'unknown' },
  ])
    expect(() => safetyReportReceipt(value, input)).toThrow();
});
it('uses existing authorized RPCs and rejects restricted access or read-only writes before dispatch', async () => {
  const calls: { name: string; args: unknown }[] = [];
  const caps = { moderation_read: true, moderation_write: false, legal_read: false };
  const client = createEmployeeSession(
    { independentEmployeeIdentity: true },
    {
      origin: 'https://admin.dojipro.com',
      upstream: async (url, init) => {
        if (url.endsWith('/api/session'))
          return Response.json({
            signedIn: true,
            assurance: 'aal2',
            csrf: 'c'.repeat(43),
            operator: { user_id: safetyActor, capabilities: caps },
          });
        const call = JSON.parse(String(init?.body));
        calls.push(call);
        return Response.json(
          call.name === 'get_admin_safety_target_v1'
            ? targetFixture()
            : { id: safetyId, report_id: linkedReportId, revision: 2, outcome: 'saved' },
        );
      },
    },
  );
  await client.restore();
  const item = safetyRecord(
    { ...safetyFixture(), classification: { targets: ['post'] } },
    safetyId,
  );
  await readSafetyTarget(client, item, 'post', targetId, new AbortController().signal);
  expect(calls[0]).toEqual({
    name: 'get_admin_safety_target_v1',
    args: { p_case_id: safetyId, p_kind: 'post', p_target_id: targetId },
  });
  await expect(
    readSafetyTarget(
      client,
      { ...item, queue: 'restricted_safety' },
      'post',
      targetId,
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  await expect(
    client.createSafetyReport(input, 'moderation', new AbortController().signal),
  ).rejects.toThrow();
  expect(calls).toHaveLength(1);
  caps.moderation_write = true;
  await client.restore();
  await client.createSafetyReport(input, 'moderation', new AbortController().signal);
  await client.createSafetyReport(input, 'moderation', new AbortController().signal);
  expect(calls[1]).toEqual({ name: 'admin_create_safety_report_v1', args: input });
  expect(calls[1]).toEqual(calls[2]);
});
