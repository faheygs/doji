import type { Page, APIRequestContext } from '@playwright/test';
import { installBusinessFixture } from './business-fixture';
import {
  appealFixture,
  appealOwner,
  moderatorId,
  reportFixture,
  decisionId,
} from '../moderation-fixture';
export async function moderationFixture(page: Page, request: APIRequestContext) {
  const base = await installBusinessFixture(page, request);
  const report = reportFixture(),
    appeal = appealFixture(),
    owner = appealOwner();
  const caps = {
    moderation_read: true,
    moderation_write: true,
    legal_read: true,
    restricted_review: true,
    operator_manage: false,
  };
  const writes: { name: string; args: Record<string, unknown> }[] = [],
    reads: string[] = [];
  let uncertain = false,
    reject = false,
    signing = 0;
  const receipts = new Map<string, unknown>();
  await page.route('https://admin.dojipro.com/api/session', (route) =>
    route.fulfill({
      json: {
        signedIn: true,
        assurance: 'aal2',
        csrf: 'c'.repeat(43),
        operator: { user_id: moderatorId, capabilities: caps },
      },
    }),
  );
  await page.route('https://admin.dojipro.com/api/rpc', async (route) => {
    const call = route.request().postDataJSON() as (typeof writes)[number];
    const { name, args } = call;
    if (name.startsWith('get_admin_')) {
      reads.push(name);
      if (name === 'get_admin_report_case_v3') return route.fulfill({ json: report });
      if (name === 'get_admin_appeal_case_v1') return route.fulfill({ json: appeal });
      if (name === 'get_admin_case_ownership_v1') return route.fulfill({ json: owner });
      return route.fallback();
    }
    if (name === 'portal_sign_evidence_v1') {
      signing++;
      return route.fulfill({
        json: {
          signedUrl:
            'https://tvixsmqxotuvyjqzmjla.supabase.co/storage/v1/object/sign/' +
            String(args.bucket) +
            '/' +
            String(args.path) +
            '?token=synthetic',
        },
      });
    }
    if (!name.startsWith('admin_')) return route.fallback();
    writes.push(call);
    if (reject) return route.fulfill({ status: 409, json: { message: 'Synthetic conflict' } });
    const key = String(args.p_idempotency_key ?? args.p_request_id);
    let result = receipts.get(key);
    if (!result) {
      if (name === 'admin_triage_report') {
        const assigned = args.p_action === 'release' ? null : moderatorId;
        Object.assign(report, { assigned_to: assigned });
        Object.assign(report.triage_state, { assigned_to: assigned });
        result = { report_id: report.id, assigned_to: assigned, priority: 'normal' };
      } else if (name === 'admin_decide_report_v3') {
        report.status =
          args.p_action === 'escalate_restricted'
            ? 'pending'
            : args.p_action === 'no_violation'
              ? 'dismissed'
              : 'actioned';
        if (args.p_action === 'escalate_restricted')
          report.triage_state.queue = 'restricted_safety';
        result = {
          report_id: report.id,
          decision_id: decisionId,
          action: args.p_action,
          status: report.status,
        };
      } else if (name === 'admin_review_moderation_appeal') {
        appeal.appeal.status = args.p_outcome === 'uphold' ? 'upheld' : 'reversed';
        appeal.review_eligibility.can_review = false;
        result = {
          appeal_id: appeal.appeal.id,
          decision_id: decisionId,
          status: appeal.appeal.status,
        };
      } else if (name === 'admin_case_ownership_command_v1') {
        Object.assign(owner, {
          assigned_to:
            args.p_action === 'release'
              ? null
              : args.p_action === 'assign'
                ? String(args.p_target)
                : moderatorId,
          revision: owner.revision + 1,
          can_claim: args.p_action === 'release',
          can_decide: true,
        });
        result = {
          id: owner.id,
          kind: 'appeal',
          assigned_to: owner.assigned_to,
          revision: owner.revision,
          replayed: false,
        };
      } else
        return route.fulfill({ status: 400, json: { message: 'Unexpected synthetic command' } });
      receipts.set(key, result);
    }
    if (uncertain) {
      uncertain = false;
      return route.abort('failed');
    }
    return route.fulfill({ json: result });
  });
  return {
    ...base,
    report,
    appeal,
    owner,
    caps,
    writes,
    reads,
    signing: () => signing,
    failOnce: () => {
      uncertain = true;
    },
    conflict: () => {
      reject = true;
    },
  };
}
export const moderationUrl = 'https://admin.dojipro.com/connected.html#/';
