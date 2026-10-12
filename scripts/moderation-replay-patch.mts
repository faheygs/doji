import assert from 'node:assert/strict';

export const signatures = [
  'public.admin_decide_report_v3(uuid,text,text,text,text,text,text,integer,text)',
  'public.admin_review_moderation_appeal(uuid,text,text,text)',
] as const;
function once(source: string, anchor: string, replacement: string) {
  assert.equal(source.split(anchor).length, 2, `Expected one anchor: ${anchor}`);
  return source.replace(anchor, replacement);
}
const fingerprint = (appeal: boolean) => `encode(pg_catalog.sha256(convert_to(jsonb_build_array(
  ${appeal ? "'appeal',p_appeal_id,p_outcome,btrim(coalesce(p_reason,''))" : "'report',p_report_id,p_action,p_policy_code,p_severity,btrim(coalesce(p_reason,'')),btrim(coalesce(p_user_notice,'')),p_account_action,p_restriction_days"}
  )::text,'UTF8')),'hex')`;

/** Only two existing command bodies change; owners, ACLs and signatures are preserved. */
export function patchModeration(source: string, appeal: boolean) {
  assert.ok(!source.includes('MODERATION_OUTER_REPLAY_V1'), 'Already patched');
  const id = appeal ? 'p_appeal_id' : 'p_report_id';
  const permission = appeal
    ? `exists(select 1 from public.moderation_appeals a join public.moderation_account_actions c
       on c.decision_id=a.decision_id where a.id=p_appeal_id and c.action in ('temporary_restriction','permanent_ban'))`
    : `exists(select 1 from public.admin_report_triage t where t.report_id=p_report_id and t.queue='restricted_safety')`;
  const guard = `
  -- MODERATION_OUTER_REPLAY_V1: serialize the entire wrapper, not only its delegate.
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(auth.jwt()->>'aal','') <> 'aal2' then raise exception 'Administrator MFA required'; end if;
  if not public.admin_user_has_permission('moderation.write') then raise exception 'Moderation write access required'; end if;
  if ${id} is null or char_length(coalesce(p_idempotency_key,'')) not between 16 and 160 then
    raise exception 'Invalid command identity'; end if;
  -- Actor/key lock also serializes reuse across the report and appeal wrappers.
  perform pg_advisory_xact_lock(hashtextextended('moderation-command:'||auth.uid()::text||':'||p_idempotency_key,0));
  perform pg_advisory_xact_lock(hashtextextended(${id}::text,0));
  if not public.admin_user_has_permission('moderation.write') then raise exception 'Moderation write access required'; end if;
  declare saved jsonb; request_hash text := ${fingerprint(appeal)};
  begin
    select receipt.result into saved from public.admin_portal_command_receipts receipt
      where receipt.user_id=auth.uid() and receipt.idempotency_key=p_idempotency_key;
    if (${permission}${appeal ? '' : " or coalesce((saved->>'restricted_review')::boolean,false)"})
      and not public.admin_user_has_permission('legal.read') then raise exception 'Restricted safety authorization required'; end if;
    if saved is not null then
      if saved->>'${appeal ? 'appeal_id' : 'report_id'}' is distinct from ${id}::text
        or ${appeal ? "saved->>'status' is distinct from (case p_outcome when 'uphold' then 'upheld' when 'reverse' then 'reversed' else null end)" : "saved->>'action' is distinct from p_action or saved->>'decision_id' is null"}
        or (saved ? '_moderation_request_sha256' and saved->>'_moderation_request_sha256' is distinct from request_hash) then
        raise exception 'Idempotency key already used for a different command'; end if;
      -- Historical receipts have no request hash. Return their original outcome only;
      -- never re-run side effects or infer that changed fields were applied.
      return saved;
    end if;
  end;
`;
  if (appeal) {
    source = once(
      source,
      'begin\n  select appeal.user_id',
      'begin\n' + guard + '\n  select appeal.user_id',
    );
    source = once(
      source,
      "  return v_result || jsonb_build_object('account_action_reversed',\n    p_outcome = 'reverse' and selected_action.id is not null);",
      `  v_result := v_result || jsonb_build_object('account_action_reversed',
    p_outcome = 'reverse' and selected_action.id is not null,
    '_moderation_request_sha256',${fingerprint(true)});
  update public.admin_portal_command_receipts set result=v_result
    where user_id=auth.uid() and idempotency_key=p_idempotency_key;
  return v_result;`,
    );
  } else {
    assert.ok(source.includes('update public.admin_portal_command_receipts'));
    source = once(
      source,
      '  select * into report_row from public.reports where id = p_report_id;',
      guard + '\n  select * into report_row from public.reports where id = p_report_id;',
    );
    source = once(
      source,
      `    return public.admin_decide_report_v2(
      p_report_id, p_action, p_policy_code, p_severity,
      p_reason, p_user_notice, p_idempotency_key
    );`,
      `    v_result := public.admin_decide_report_v2(
      p_report_id, p_action, p_policy_code, p_severity,
      p_reason, p_user_notice, p_idempotency_key
    ) || jsonb_build_object('_moderation_request_sha256',${fingerprint(false)});
    update public.admin_portal_command_receipts set result=v_result
      where user_id=auth.uid() and idempotency_key=p_idempotency_key;
    return v_result;`,
    );
    source = once(
      source,
      "    'restricted_review', true,",
      `    '_moderation_request_sha256',${fingerprint(false)},
    'restricted_review', true,`,
    );
  }
  return source;
}
