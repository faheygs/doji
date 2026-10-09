import { describe, expect, it } from 'vitest';
import { createEmployeeSession } from './employee-session';
import {
  moderationReceipt,
  moderationRequest,
  validModerationInput,
  type ModerationInput,
} from './moderation-command-contracts';
import {
  evidenceReferences,
  preservedReferences,
  verifiedEvidenceUrl,
  validEvidenceReference,
} from './moderation-evidence';
import { reportId, decisionId, moderatorId } from '../../../tests/moderation-fixture';
const input: ModerationInput = {
  kind: 'decision',
  id: reportId,
  key: decisionId,
  restricted: false,
  action: 'no_violation',
  policy: 'no_violation',
  severity: 'none',
  reason: 'Reviewed available evidence.',
  notice: 'No policy violation was found.',
  account: null,
  days: null,
};
async function fixture(caps: Record<string, boolean>, response: unknown) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
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
            operator: { user_id: moderatorId, capabilities: caps },
          });
        if (url.endsWith('/auth/logout')) return Response.json({ signedOut: true });
        calls.push(JSON.parse(String(init?.body)) as (typeof calls)[number]);
        await delay?.();
        return Response.json(response);
      },
    },
  );
  await controller.restore();
  return {
    controller,
    calls,
    delay: (fn: () => Promise<void>) => {
      delay = fn;
    },
  };
}
const caps = {
  moderation_read: true,
  moderation_write: true,
  legal_read: true,
  restricted_review: true,
};
describe('existing moderation commands', () => {
  it('requires no fields for native claim and never routes it through staff ownership', () => {
    const claim: ModerationInput = {
      kind: 'triage',
      id: reportId,
      key: decisionId,
      action: 'claim',
      restricted: false,
    };
    expect(validModerationInput(claim)).toBe(true);
    expect(moderationRequest(claim)).toEqual({
      path: '/portal/admin/report-triage',
      body: { reportId, action: 'claim', priority: null, note: null, idempotencyKey: decisionId },
    });
    expect(() =>
      moderationReceipt(
        { report_id: reportId, assigned_to: moderatorId, priority: 'normal' },
        claim,
        moderatorId,
      ),
    ).not.toThrow();
    expect(() =>
      moderationReceipt(
        { report_id: reportId, assigned_to: reportId, priority: 'normal' },
        claim,
        moderatorId,
      ),
    ).toThrow();
  });
  it('validates every removal, escalation and restricted consequence combination', () => {
    expect(validModerationInput(input)).toBe(true);
    for (const account of ['warning', 'temporary_restriction', 'permanent_ban']) {
      const restricted: ModerationInput = {
        ...input,
        action: 'remove_content',
        policy: 'restricted_goods',
        severity: 'level_3',
        restricted: true,
        account,
        days: account === 'temporary_restriction' ? 7 : null,
      };
      expect(validModerationInput(restricted)).toBe(true);
      expect(validModerationInput({ ...restricted, restricted: false })).toBe(false);
    }
    for (const patch of [
      { reason: '' },
      { notice: 'short' },
      { policy: 'other' },
      { account: 'permanent_ban' },
      { days: 0 },
      { injected: 'extra' },
    ])
      expect(validModerationInput({ ...input, ...patch })).toBe(false);
    const escalation = {
      ...input,
      action: 'escalate_restricted',
      policy: 'child_safety',
      severity: 'level_3',
    };
    expect(validModerationInput(escalation)).toBe(true);
    expect(validModerationInput({ ...escalation, restricted: true })).toBe(false);
    expect(validModerationInput({ ...escalation, action: 'remove_content' })).toBe(false);
  });
  it('preserves exact appeal identity and never sends a report command for an appeal', () => {
    const appeal: ModerationInput = {
      kind: 'appeal',
      id: reportId,
      decisionId,
      key: decisionId,
      action: 'reverse',
      reason: 'Independent review outcome.',
      restricted: false,
    };
    expect(validModerationInput(appeal)).toBe(true);
    expect(moderationRequest(appeal).path).toBe('/portal/admin/appeal-decision');
    expect(() =>
      moderationReceipt(
        { appeal_id: reportId, decision_id: decisionId, status: 'reversed' },
        appeal,
        moderatorId,
      ),
    ).not.toThrow();
    expect(() =>
      moderationReceipt(
        { appeal_id: reportId, decision_id: reportId, status: 'reversed' },
        appeal,
        moderatorId,
      ),
    ).toThrow();
  });
  it('binds appeal ownership to existing revision and source version', () => {
    const claim: ModerationInput = {
      kind: 'ownership',
      id: reportId,
      key: decisionId,
      action: 'claim',
      restricted: false,
      revision: 3,
      sourceVersion: 'a'.repeat(32),
    };
    expect(validModerationInput(claim)).toBe(true);
    expect(moderationRequest(claim).body).toMatchObject({
      p_kind: 'appeal',
      p_revision: 3,
      p_source_version: 'a'.repeat(32),
      p_target: null,
    });
    expect(validModerationInput({ ...claim, sourceVersion: '3' })).toBe(false);
    expect(() =>
      moderationReceipt(
        { id: reportId, kind: 'appeal', revision: 4, assigned_to: moderatorId, replayed: false },
        claim,
        moderatorId,
      ),
    ).not.toThrow();
  });
  it('requires an unchanged enforcement receipt for reopening or reclosing', () => {
    const review: ModerationInput = {
      kind: 'review',
      id: reportId,
      decisionId,
      key: decisionId,
      action: 'reopen',
      reason: 'Follow-up evidence review.',
      restricted: false,
    };
    expect(validModerationInput(review)).toBe(true);
    const receipt = {
      report_id: reportId,
      decision_id: decisionId,
      enforcement_changed: false,
      status: 'pending',
      review_state: 'reopened',
    };
    expect(() => moderationReceipt(receipt, review, moderatorId)).not.toThrow();
    expect(() =>
      moderationReceipt({ ...receipt, enforcement_changed: true }, review, moderatorId),
    ).toThrow();
  });
  it('dispatches one existing atomic command with exact parameter mapping', async () => {
    const f = await fixture(caps, {
      report_id: reportId,
      decision_id: decisionId,
      action: 'no_violation',
      status: 'dismissed',
    });
    await f.controller.moderate(input, new AbortController().signal);
    expect(f.calls).toEqual([
      {
        name: 'admin_decide_report_v3',
        args: {
          p_report_id: reportId,
          p_action: 'no_violation',
          p_policy_code: 'no_violation',
          p_severity: 'none',
          p_reason: input.reason,
          p_user_notice: input.notice,
          p_account_action: null,
          p_restriction_days: null,
          p_idempotency_key: decisionId,
        },
      },
    ]);
  });
  it('denies missing write/restricted capability before dispatch', async () => {
    for (const grant of [
      { ...caps, moderation_write: false },
      { ...caps, restricted_review: false },
      { ...caps, legal_read: false },
    ]) {
      const f = await fixture(grant, {});
      await expect(
        f.controller.moderate({ ...input, restricted: true }, new AbortController().signal),
      ).rejects.toThrow();
      expect(f.calls).toEqual([]);
    }
  });
  it('rejects a late receipt after logout without claiming the server write was rolled back', async () => {
    const f = await fixture(caps, {
      report_id: reportId,
      decision_id: decisionId,
      action: 'no_violation',
      status: 'dismissed',
    });
    let release!: () => void;
    f.delay(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const pending = f.controller.moderate(input, new AbortController().signal);
    const rejected = expect(pending).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const logout = f.controller.signOut();
    release();
    await logout;
    await rejected;
    expect(f.calls).toHaveLength(1);
  });
});
describe('protected evidence boundaries', () => {
  const ref = {
    slot: 'photo',
    kind: 'image' as const,
    availability: 'available',
    bucket: 'post-media',
    path: reportId + '/photo.jpg',
  };
  const url =
    'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/sign/post-media/' +
    ref.path +
    '?token=synthetic';
  it('admits bounded authorized references but no arbitrary URL, traversal or extra metadata', () => {
    expect(evidenceReferences([{ ...ref, signedUrl: 'https://untrusted.invalid' }])).toEqual([ref]);
    for (const path of ['../secret', 'a//b', 'https://example.com', 'a%2fb', 'a?b', 'a\\b'])
      expect(validEvidenceReference('post-media', path)).toBe(false);
    expect(() => evidenceReferences(Array.from({ length: 4 }, () => ref))).toThrow();
  });
  it('rejects a mismatched archive and wrong signed object or destination', () => {
    expect(() =>
      preservedReferences(
        {
          source: 'preserved_decision_media',
          decision_id: reportId,
          historical_snapshot: true,
          items: [],
        },
        decisionId,
      ),
    ).toThrow();
    expect(verifiedEvidenceUrl(url, ref)).toBe(url);
    for (const bad of [
      url.replace('supabase.co', 'evil.test'),
      url.replace('photo.jpg', 'other.jpg'),
      url.replace('https:', 'http:'),
      url + '#fragment',
      url.replace('?token=synthetic', ''),
    ])
      expect(() => verifiedEvidenceUrl(bad, ref)).toThrow();
  });
  it('signs only on explicit request and returns a bounded local expiry', async () => {
    const f = await fixture(caps, { signedUrl: url });
    expect(f.calls).toEqual([]);
    const result = await f.controller.readEvidence(ref, false, new AbortController().signal);
    expect(result.url).toBe(url);
    expect(result.expiresAt - Date.now()).toBeLessThanOrEqual(270000);
    expect(f.calls).toEqual([
      { name: 'portal_sign_evidence_v1', args: { bucket: ref.bucket, path: ref.path } },
    ]);
  });
});
