import { describe, expect, it } from 'vitest';
import { reportRecord, appealRecord, readModerationRecord } from './moderation-record';
import { assertEmployeeRead } from './employee-read-policy';
import { createEmployeeSession } from './employee-session';
import {
  reportId,
  appealId,
  decisionId,
  moderatorId,
  reportFixture,
  appealFixture,
  appealOwner,
} from '../../../tests/moderation-fixture';
async function setup(
  legal = true,
  payload: unknown = reportFixture(),
  owner: unknown = appealOwner(),
) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = createEmployeeSession(
    { independentEmployeeIdentity: true, staffWorkflowEnabled: true },
    {
      origin: 'https://admin.dojipro.com',
      upstream: async (url, init) => {
        if (url.endsWith('/api/session'))
          return Response.json({
            signedIn: true,
            assurance: 'aal2',
            csrf: 'c'.repeat(43),
            operator: {
              user_id: moderatorId,
              capabilities: { moderation_read: true, legal_read: legal },
            },
          });
        const call = JSON.parse(String(init?.body)) as (typeof calls)[number];
        calls.push(call);
        return Response.json(call.name === 'get_admin_case_ownership_v1' ? owner : payload);
      },
    },
  );
  await client.restore();
  return { client, calls };
}
describe('moderation record boundaries', () => {
  it('projects only bounded display data and never admits media URLs or secret fields', () => {
    const f = reportFixture();
    f.media_manifest.items = [
      {
        slot: 'photo',
        kind: 'image',
        availability: 'available',
        bucket: 'post-media',
        path: 'private.jpg',
        signedURL: 'https://untrusted.invalid/secret',
      },
    ];
    const result = reportRecord({ ...f, token: 'private-token' }, reportId);
    expect(result.manifest).toEqual([{ slot: 'photo', kind: 'image', availability: 'available' }]);
    expect(JSON.stringify(result)).not.toMatch(/private-token|untrusted/);
    expect(result.media[0]?.path).toBe('private.jpg');
    expect(reportRecord({ ...f, target_kind: 'account' }, reportId).targetKind).toBe('account');
  });
  it('rejects mismatched identity, version, queues and oversized evidence', () => {
    for (const change of [
      { id: appealId },
      { case_contract_version: 2 },
      { triage_state: { queue: 'unknown' } },
      { evidence: { exists: true, caption: 'x'.repeat(12001) } },
      { media_manifest: { source: 'current_content', historical_snapshot: true, items: [] } },
    ])
      expect(() => reportRecord({ ...reportFixture(), ...change }, reportId)).toThrow();
  });
  it('binds appeal to exact original decision and ignores newer report decision', () => {
    const f = appealFixture();
    const result = appealRecord(
      {
        ...f,
        report_case: {
          ...f.report_case,
          current_decision: { id: reportId, rationale: 'Newer unrelated rationale' },
          preserved_media_manifest: { decision_id: reportId },
        },
      },
      appealId,
    );
    expect(result.original.id).toBe(decisionId);
    expect(result.report.currentDecision).toBeNull();
    expect(JSON.stringify(result)).not.toContain('Newer unrelated');
    expect(() =>
      appealRecord({ ...f, original_decision: { ...f.original_decision, id: reportId } }, appealId),
    ).toThrow();
    expect(() =>
      appealRecord(
        {
          ...f,
          original_evidence: {
            ...f.original_evidence,
            preserved_media_manifest: { decision_id: reportId },
          },
        },
        appealId,
      ),
    ).toThrow();
    expect(() =>
      appealRecord({ ...f, appeal: { ...f.appeal, report_id: appealId } }, appealId),
    ).toThrow();
  });
  it('permits only exact read URL shapes, never a command or arbitrary query parameter', () => {
    expect(() =>
      assertEmployeeRead('/portal/admin/report-case-v3?id=' + reportId, false),
    ).not.toThrow();
    for (const path of [
      '/portal/admin/report-decision',
      '/portal/admin/report-case-v3?id=' + reportId + '&extra=1',
      '/portal/admin/appeal-case?id=bad',
    ])
      expect(() => assertEmployeeRead(path, false)).toThrow();
    expect(() => assertEmployeeRead('/portal/admin/report-case-v3?id=' + reportId, true)).toThrow();
  });
  it('uses exact existing report/appeal RPCs and separate appeal ownership', async () => {
    const report = await setup();
    await readModerationRecord(
      report.client,
      'report',
      reportId,
      'trust-safety',
      new AbortController().signal,
    );
    expect(report.calls).toEqual([
      { name: 'get_admin_report_case_v3', args: { p_report_id: reportId } },
    ]);
    const appeal = await setup(true, appealFixture());
    const result = await readModerationRecord(
      appeal.client,
      'appeal',
      appealId,
      'my-work',
      new AbortController().signal,
    );
    expect(result.owner?.assigned_to).toBe(moderatorId);
    expect(appeal.calls.map((c) => c.name)).toEqual([
      'get_admin_appeal_case_v1',
      'get_admin_case_ownership_v1',
    ]);
  });
  it('denies restricted navigation before dispatch and restricted responses before display', async () => {
    const { client, calls } = await setup(false, {
      ...reportFixture(),
      triage_state: { queue: 'restricted_safety' },
    });
    await expect(
      readModerationRecord(
        client,
        'report',
        reportId,
        'restricted-safety',
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
    await expect(
      readModerationRecord(client, 'report', reportId, 'my-work', new AbortController().signal),
    ).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
  it('keeps only bounded ownership display fields in the appeal cache', async () => {
    const f = await setup(true, appealFixture(), { ...appealOwner(), secret: 'not-for-cache' });
    const result = await readModerationRecord(
      f.client,
      'appeal',
      appealId,
      'my-work',
      new AbortController().signal,
    );
    const { id: _id, kind: _kind, ...display } = appealOwner();
    void _id;
    void _kind;
    expect(result.owner).toEqual(display);
    const invalid = await setup(true, appealFixture(), {
      ...appealOwner(),
      owner_label: 'x'.repeat(201),
    });
    await expect(
      readModerationRecord(
        invalid.client,
        'appeal',
        appealId,
        'my-work',
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  });
  it('account consequences restrict an appeal even if the underlying report was ordinary', async () => {
    const f = appealFixture();
    f.original_decision.account_action = 'permanent_ban';
    const { client } = await setup(false, f);
    await expect(
      readModerationRecord(client, 'appeal', appealId, 'my-work', new AbortController().signal),
    ).rejects.toThrow();
  });
});
