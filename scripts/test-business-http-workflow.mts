// Called only by the synthetic localhost Auth runner. No hosted calls, forged JWTs,
// new providers, browser mocks, or SQL role impersonation for application actions.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { executeBusinessErasure } from '../supabase/functions/_shared/business-erasure.ts';
import type { createBusinessApplicationClient } from '../website/business-portal/application-client.mts';
import { evidenceRecord, evidenceText, evidenceArray } from './release-evidence.mts';
export type LocalAuth = (
  path: string,
  body?: unknown,
  bearer?: string,
  method?: string,
) => Promise<Record<string, unknown>>;
export interface LocalStatus {
  API_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
}
interface Workflow {
  client: ReturnType<typeof createBusinessApplicationClient>;
  auth: LocalAuth;
  upstream: typeof fetch;
  status: LocalStatus;
  sql: (input: string) => string;
  pass: (label: string) => void;
  password: string;
  memberSession: Record<string, unknown>;
  totp: (secret: string) => string;
  bearer: () => string | undefined;
}

export async function qualifyBusinessHttpWorkflow({
  client,
  auth,
  upstream,
  status,
  sql,
  pass,
  password,
  memberSession,
  totp,
  bearer,
}: Workflow) {
  assert.equal(status.API_URL, 'http://127.0.0.1:54431');
  const conflictResponses: { rpc: string; status: number; code: string; elapsedMs: number }[] = [];
  const rpc = async (token: string, name: string, body: Record<string, unknown> = {}) => {
    assert.match(name, /^[a-z_0-9]+$/);
    const response = await upstream(`${status.API_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: status.ANON_KEY,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    return { status: response.status, body: (await response.json()) as unknown };
  };
  const ok = async (...args: Parameters<typeof rpc>) => {
    const result = await rpc(...args);
    assert.equal(result.status, 200, `Local RPC ${args[1]} HTTP ${result.status}`);
    return evidenceRecord(result.body);
  };
  const denied = async (
    token: string,
    name: string,
    body: Record<string, unknown> = {},
    code = '42501',
  ) => {
    const started = performance.now();
    const result = await rpc(token, name, body);
    assert.ok(result.status >= 400, `${name} must be denied`);
    assert.equal(evidenceRecord(result.body).code, code);
    if (code === 'PT409') {
      assert.equal(result.status, 409);
      conflictResponses.push({
        rpc: name,
        status: result.status,
        code,
        elapsedMs: Math.round(performance.now() - started),
      });
    }
  };
  const details = {
    legal_name: 'Synthetic HTTP LLC',
    brand_name: 'HTTP rehearsal',
    website: 'https://example.test',
    country: 'US',
    business_address: '123 Test Street',
    representative_name: 'Synthetic Owner',
    representative_role: 'Owner',
    category: 'Technology',
    purpose: 'Local qualification only',
  };
  const command = (
    action: string,
    application: { revision?: unknown } | null,
    fields = details,
  ) => ({
    p_action: action,
    p_revision:
      evidenceRecord(application)?.revision == null
        ? null
        : Number(evidenceRecord(application).revision),
    p_details: fields,
    p_terms_version: action === 'submit' ? 'http-test-terms' : null,
    p_privacy_version: action === 'submit' ? 'http-test-privacy' : null,
    p_request_id: randomUUID(),
  });
  let employee: Record<string, unknown> | undefined;
  const sharedFingerprint = () =>
    sql(`select md5(coalesce(string_agg(
    p.oid::text||pg_get_functiondef(p.oid)||coalesce(p.proacl::text,''),'' order by p.oid),''))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and p.proname not like '%business%';`);
  const baseline = sharedFingerprint();
  try {
    sql(
      "update business_private.settings set enabled=true,realtime_enabled=false,application_terms_version='http-test-terms',privacy_version='http-test-privacy';",
    );
    assert.equal(await client.read(), null);
    pass('real business JWT reads authoritative empty application through PostgREST');
    const businessToken = bearer();
    assert.ok(businessToken);
    await denied(
      businessToken,
      'business_application_command_v1',
      command('save', { revision: 77 }),
      'PT409',
    );
    pass(
      'nonexistent application with a supplied revision returns HTTP 409, not a transaction retry',
    );
    await denied(businessToken, 'get_own_profile');
    await denied(
      evidenceText(evidenceRecord(memberSession).access_token),
      'get_business_application_v1',
    );
    await denied(status.ANON_KEY, 'get_business_application_v1');
    pass('actual HTTP boundary denies business-to-member, member-to-business and anonymous access');

    const other = await auth('admin/users', {
      email: `other-business-${randomUUID()}@test.invalid`,
      password,
      email_confirm: true,
      role: 'doji_business',
      app_metadata: {
        account_type: 'business',
        business_signup: {
          terms_accepted: true,
          privacy_acknowledged: true,
          terms_version: 'http-test-terms',
          privacy_version: 'http-test-privacy',
        },
      },
    });
    const otherSession = await auth(
      'token?grant_type=password',
      { email: other.email, password },
      status.ANON_KEY,
    );
    assert.equal(evidenceRecord(evidenceRecord(otherSession).user).role, 'doji_business');
    let application = evidenceRecord((await client.command(command('save', null))).application);
    assert.equal(evidenceRecord(application).state, 'draft');
    const submit = command('submit', application);
    application = evidenceRecord((await client.command(submit)).application);
    const replay = await client.command(submit);
    assert.equal(evidenceRecord(replay).replayed, true);
    assert.equal(
      evidenceRecord(evidenceRecord(replay).application).id,
      evidenceRecord(application).id,
    );
    assert.equal(
      evidenceRecord(evidenceRecord(replay).application).revision,
      evidenceRecord(application).revision,
    );
    assert.equal(
      evidenceRecord(evidenceRecord(application).latest_submission).terms_version,
      'http-test-terms',
    );
    assert.equal(
      evidenceRecord(evidenceRecord(application).latest_submission).privacy_version,
      'http-test-privacy',
    );
    await denied(
      businessToken,
      'business_application_command_v1',
      command('save', { revision: 1 }),
      'PT409',
    );
    pass('stale applicant save returns HTTP 409 without overwriting the submitted snapshot');
    assert.equal(
      sql(
        `select count(*) from business_private.submissions where application_id='${evidenceRecord(application).id}';`,
      ),
      '1',
    );
    pass('HTTP save, submission and identical retry retain one snapshot and exact legal consent');
    assert.equal(
      (
        await rpc(
          evidenceText(evidenceText(evidenceRecord(otherSession).access_token)),
          'get_business_application_v1',
        )
      ).body,
      null,
    );
    await denied(
      evidenceText(evidenceRecord(otherSession).access_token),
      'get_admin_business_application_v1',
      {
        p_id: evidenceRecord(application).id,
      },
    );
    await denied(businessToken, 'get_admin_business_applications_page_v1');
    pass('second actual business account cannot read another application or the employee queue');

    employee = await auth('admin/users', {
      email: `business-reviewer-${randomUUID()}@test.invalid`,
      password,
      email_confirm: true,
      role: 'doji_employee',
      app_metadata: { account_type: 'employee' },
    });
    sql(`insert into public.admin_employees(id,display_name,status,roles)
      values('${employee.id}','Synthetic HTTP reviewer','active',array['super_admin']);`);
    let staff = await auth(
      'token?grant_type=password',
      { email: employee.email, password },
      status.ANON_KEY,
    );
    assert.equal(evidenceRecord(evidenceRecord(staff).user).role, 'doji_employee');
    await denied(
      evidenceText(evidenceRecord(staff).access_token),
      'get_admin_business_applications_page_v1',
    );
    const factor = await auth(
      'factors',
      { factor_type: 'totp', friendly_name: 'HTTP qualification' },
      evidenceText(evidenceRecord(staff).access_token),
    );
    const challenge = await auth(
      `factors/${evidenceRecord(factor).id}/challenge`,
      {},
      evidenceText(evidenceRecord(staff).access_token),
    );
    staff = await auth(
      `factors/${evidenceRecord(factor).id}/verify`,
      {
        challenge_id: challenge.id,
        code: totp(evidenceText(evidenceRecord(evidenceRecord(factor).totp).secret)),
      },
      evidenceText(evidenceRecord(staff).access_token),
    );
    assert.equal(
      JSON.parse(
        Buffer.from(
          evidenceText(evidenceText(evidenceRecord(staff).access_token).split('.')[1]),
          'base64url',
        ).toString('utf8'),
      ).aal,
      'aal2',
    );
    const queue = await ok(
      evidenceText(evidenceRecord(staff).access_token),
      'get_admin_business_applications_page_v1',
      {
        p_state: 'pending',
        p_limit: 25,
      },
    );
    assert.ok(evidenceArray(queue.items).some((row) => row.id === evidenceRecord(application).id));
    assert.ok(evidenceArray(queue.items).length <= 25);
    const review = await ok(
      evidenceText(evidenceRecord(staff).access_token),
      'get_admin_business_application_v1',
      {
        p_id: evidenceRecord(application).id,
      },
    );
    assert.deepEqual(review.details, details);
    pass(
      'real employee AAL1 is denied; real TOTP AAL2 opens exact submitted record in bounded queue',
    );
    const decide = (
      action: string,
      item: Record<string, unknown>,
      response = 'Synthetic review response.',
    ) => ({
      p_id: item.id,
      p_revision: item.revision,
      p_action: action,
      p_response: response,
      p_internal_note: 'INTERNAL ONLY synthetic verification.',
      p_request_id: randomUUID(),
    });
    const requestChanges = decide('request_changes', application, 'Please correct the address.');
    sql(
      `update public.admin_employees set roles=array['business_reviewer'] where id='${employee.id}';`,
    );
    await ok(
      evidenceText(evidenceRecord(staff).access_token),
      'get_admin_business_application_v1',
      { p_id: evidenceRecord(application).id },
    );
    await denied(
      evidenceText(evidenceRecord(staff).access_token),
      'admin_business_application_command_v1',
      requestChanges,
    );
    sql(`update public.admin_employees set roles=array['super_admin'] where id='${employee.id}';`);
    application = evidenceRecord(
      (
        await ok(
          evidenceText(evidenceRecord(staff).access_token),
          'admin_business_application_command_v1',
          requestChanges,
        )
      ).application,
    );
    let applicantRead = await client.read();
    assert.equal(evidenceRecord(applicantRead).response, 'Please correct the address.');
    assert.ok(!JSON.stringify(applicantRead).includes('INTERNAL ONLY'));
    assert.ok(
      evidenceArray(evidenceRecord(applicantRead).history).every(
        (entry) => !Object.hasOwn(entry, 'internal_note') && !Object.hasOwn(entry, 'actor_id'),
      ),
    );
    pass(
      'live role change denies reviewer decision; authorized changes reach applicant without internal notes',
    );

    const updated = { ...details, business_address: '456 Corrected Street' };
    application = evidenceRecord(
      (await client.command(command('save', application, updated))).application,
    );
    const unchangedReview = await ok(
      evidenceText(evidenceRecord(staff).access_token),
      'get_admin_business_application_v1',
      {
        p_id: evidenceRecord(application).id,
      },
    );
    assert.equal(
      evidenceRecord(evidenceRecord(unchangedReview).details).business_address,
      details.business_address,
    );
    application = evidenceRecord(
      (await client.command(command('submit', application, updated))).application,
    );
    const currentReview = await ok(
      evidenceText(evidenceRecord(staff).access_token),
      'get_admin_business_application_v1',
      {
        p_id: evidenceRecord(application).id,
      },
    );
    assert.equal(
      evidenceRecord(evidenceRecord(currentReview).details).business_address,
      updated.business_address,
    );
    await denied(
      evidenceText(evidenceRecord(staff).access_token),
      'admin_business_application_command_v1',
      decide('approve', review),
      'PT409',
    );
    pass(
      'private draft stays out of review; resubmission updates exact evidence and stale decisions fail',
    );
    const approval = decide('approve', application);
    application = evidenceRecord(
      (
        await ok(
          evidenceText(evidenceRecord(staff).access_token),
          'admin_business_application_command_v1',
          approval,
        )
      ).application,
    );
    assert.equal(
      (
        await ok(
          evidenceText(evidenceRecord(staff).access_token),
          'admin_business_application_command_v1',
          approval,
        )
      ).replayed,
      true,
    );
    let workspace = await client.workspace();
    const organizationId = evidenceRecord(workspace).organization_id;
    assert.equal(evidenceRecord(workspace).campaigns_enabled, false);
    assert.equal(evidenceRecord(workspace).billing_enabled, false);
    assert.equal(
      sql(
        `select count(*) from business_private.organizations where application_id='${evidenceRecord(application).id}';`,
      ),
      '1',
    );
    pass(
      'approval and retry grant one MFA business workspace, never campaign publishing or billing',
    );

    application = evidenceRecord(
      (
        await ok(
          evidenceText(evidenceRecord(staff).access_token),
          'admin_business_application_command_v1',
          decide('reopen', application),
        )
      ).application,
    );
    await denied(businessToken, 'get_business_workspace_v1');
    assert.equal(evidenceRecord(await client.read()).state, 'changes_requested');
    application = evidenceRecord(
      (await client.command(command('submit', application, updated))).application,
    );
    application = evidenceRecord(
      (
        await ok(
          evidenceText(evidenceRecord(staff).access_token),
          'admin_business_application_command_v1',
          decide('approve', application),
        )
      ).application,
    );
    workspace = await client.workspace();
    assert.equal(evidenceRecord(workspace).organization_id, organizationId);
    pass(
      'reopening revokes existing-token workspace access; reapproval reuses the same organization',
    );

    sql(`update public.admin_employees set status='disabled' where id='${employee.id}';`);
    await denied(
      evidenceText(evidenceRecord(staff).access_token),
      'get_admin_business_application_v1',
      { p_id: evidenceRecord(application).id },
    );
    await denied(
      evidenceText(evidenceRecord(staff).access_token),
      'admin_business_application_command_v1',
      decide('reopen', application),
    );
    pass('employee disable immediately denies reads and decisions using the already-issued JWT');
    const actor = sql(
      `select applicant_id from business_private.applications where id='${evidenceRecord(application).id}';`,
    );
    sql(`update business_private.accounts set disabled=true where id='${actor}';`);
    await denied(businessToken, 'get_business_application_v1');
    await denied(businessToken, 'business_application_command_v1', submit);
    sql(`update business_private.accounts set disabled=false where id='${actor}';`);
    sql(
      `update public.admin_employees set status='active' where id='${employee.id}'; update business_private.privacy_settings set enabled=true;`,
    );
    const correctionRequest = await ok(
      evidenceText(evidenceRecord(staff).access_token),
      'admin_business_privacy_open_v1',
      {
        p_account_id: actor,
        p_kind: 'correction',
        p_verification_reference: 'case:http-correction',
        p_due_at: '2026-10-30T00:00:00Z',
        p_request_id: randomUUID(),
      },
    );
    const correctionRead = () =>
      ok(
        evidenceText(evidenceRecord(staff).access_token),
        'get_admin_business_privacy_correction_v1',
        {
          p_case_id: correctionRequest.id,
        },
      );
    await denied(businessToken, 'get_admin_business_privacy_correction_v1', {
      p_case_id: correctionRequest.id,
    });
    assert.equal((await correctionRead()).blocked_reason, 'review_required');
    application = evidenceRecord(
      (
        await ok(
          evidenceText(evidenceRecord(staff).access_token),
          'admin_business_application_command_v1',
          decide('reopen', application),
        )
      ).application,
    );
    const currentDraft = await correctionRead();
    assert.equal(evidenceRecord(currentDraft).account_id, actor);
    assert.equal(
      evidenceRecord(evidenceRecord(currentDraft).application).revision,
      evidenceRecord(application).revision,
    );
    const savedCorrection = {
      p_case_id: correctionRequest.id,
      p_revision: evidenceRecord(currentDraft).case_revision,
      p_action: 'correct_draft',
      p_reference: 'case:http-corrected-draft',
      p_request_id: randomUUID(),
      p_details: {
        ...evidenceRecord(evidenceRecord(evidenceRecord(currentDraft).application).details),
        brand_name: 'Corrected HTTP draft',
      },
      p_application_revision: evidenceRecord(evidenceRecord(currentDraft).application).revision,
    };
    const correctionOutcome = await ok(
      evidenceText(evidenceRecord(staff).access_token),
      'admin_business_privacy_command_v1',
      savedCorrection,
    );
    assert.deepEqual(
      await ok(
        evidenceText(evidenceRecord(staff).access_token),
        'admin_business_privacy_command_v1',
        savedCorrection,
      ),
      correctionOutcome,
    );
    const afterCorrection = await correctionRead();
    assert.equal(
      evidenceRecord(evidenceRecord(evidenceRecord(afterCorrection).application).details)
        .brand_name,
      'Corrected HTTP draft',
    );
    const reviewSnapshot = await ok(
      evidenceText(evidenceRecord(staff).access_token),
      'get_admin_business_application_v1',
      {
        p_id: evidenceRecord(application).id,
      },
    );
    assert.notEqual(
      evidenceRecord(evidenceRecord(reviewSnapshot).details).brand_name,
      'Corrected HTTP draft',
    );
    assert.equal(
      evidenceRecord(evidenceRecord(await client.read()).details).brand_name,
      'Corrected HTTP draft',
    );
    pass(
      'real employee MFA correction read and idempotent draft save preserve the submitted snapshot and deny business-role access',
    );
    const privacyRequest = await ok(
      evidenceText(evidenceRecord(staff).access_token),
      'admin_business_privacy_open_v1',
      {
        p_account_id: other.id,
        p_kind: 'erasure',
        p_verification_reference: 'case:local-verified-authority',
        p_due_at: '2026-10-30T00:00:00Z',
        p_request_id: randomUUID(),
      },
    );
    await ok(
      evidenceText(evidenceRecord(staff).access_token),
      'admin_business_privacy_command_v1',
      {
        p_case_id: privacyRequest.id,
        p_revision: 1,
        p_action: 'prepare_erasure',
        p_reference: 'case:local-erasure-authority',
        p_request_id: randomUUID(),
      },
    );
    await denied(
      evidenceText(evidenceRecord(otherSession).access_token),
      'get_business_application_v1',
    );
    pass('real restricted privacy command immediately denies business reads with an existing JWT');
    const executionId = randomUUID();
    const erased = await executeBusinessErasure(
      { enabled: true, supabaseUrl: status.API_URL, serviceKey: status.SERVICE_ROLE_KEY },
      evidenceText(privacyRequest.id),
      executionId,
      upstream,
    );
    assert.equal(erased.state, 'primary_erased');
    assert.equal(
      (
        await executeBusinessErasure(
          { enabled: true, supabaseUrl: status.API_URL, serviceKey: status.SERVICE_ROLE_KEY },
          evidenceText(privacyRequest.id),
          executionId,
          upstream,
        )
      ).state,
      'primary_erased',
    );
    assert.equal(sql(`select count(*) from auth.users where id='${other.id}';`), '0');
    const survivingMember = await auth(
      'user',
      undefined,
      evidenceText(evidenceRecord(memberSession).access_token),
      'GET',
    );
    assert.equal(survivingMember.id, evidenceRecord(evidenceRecord(memberSession).user).id);
    pass(
      'exact synthetic business deleted through real Auth API; member session survives and retry is idempotent',
    );
    await denied(
      evidenceText(evidenceRecord(otherSession).access_token),
      'get_business_application_v1',
    );
    pass(
      'disabled applicant cannot replay prior commands; deleted identity cannot reuse a live JWT',
    );
    assert.equal(
      sql(
        `select count(*) from public.domain_event_outbox where aggregate_id='${evidenceRecord(application).id}';`,
      ),
      '0',
    );
    assert.equal(sharedFingerprint(), baseline);
    pass(
      'realtime-disabled workflow creates no business outbox work and changes no shared function/grant',
    );
    await auth('logout?scope=local', {}, evidenceText(evidenceRecord(staff).access_token));
  } finally {
    sql('update business_private.settings set enabled=false,realtime_enabled=false;');
    if (employee)
      sql(`update public.admin_employees set status='disabled' where id='${employee.id}';`);
  }
  return {
    conflictResponses,
    realSignedJwt: true,
    productionChanged: false,
    realtimeEnabled: false,
  };
}
