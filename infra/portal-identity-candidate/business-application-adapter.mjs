// Unconnected server-only adapter. execute(role, fixed SQL, parameters, signal)
// must use the reviewed least-privilege database role, not a service-role browser
// token. Existing private functions reauthorize and execute each command atomically.
const denied = () => Object.assign(Error('Business application access denied'), { status: 403 });
function identity(a) {
  if (
    a?.realm !== 'business' ||
    !/^user_[A-Za-z0-9]+$/.test(a.subject || '') ||
    !/^session_[A-Za-z0-9]+$/.test(a.sessionId || '') ||
    !/^client_[A-Za-z0-9]+$/.test(a.audience || '') ||
    a.issuer !== `https://api.workos.com/user_management/${a.audience}` ||
    typeof a.mfaVerified !== 'boolean'
  )
    throw denied();
  return [a.issuer, a.audience, a.subject, a.sessionId, a.mfaVerified];
}
export function createBusinessApplicationAdapter(execute) {
  if (typeof execute !== 'function') throw denied();
  const run = async (...args) => {
    try {
      return await execute(...args);
    } catch (error) {
      const status = { 42501: 403, 22023: 400, PT409: 409, 55000: 409 }[error?.code] || 503;
      throw Object.assign(Error('Business request could not be completed'), { status });
    }
  };
  const read = (actor, signal) =>
    run(
      'doji_identity_resolver',
      'select portal_identity_private.read_business_application($1,$2,$3,$4,$5) as result',
      identity(actor),
      signal,
    );
  return {
    read,
    async authorize(actor, signal) {
      await read(actor, signal);
    },
    enroll(actor, legal, signal) {
      const args = identity(actor).slice(0, 4);
      return run(
        'doji_business_enrollment',
        'select portal_identity_private.complete_business_enrollment($1,$2,$3,$4,$5,$6,$7,$8,$9) as result',
        [
          ...args,
          legal.termsAccepted,
          legal.privacyAcknowledged,
          legal.termsVersion,
          legal.privacyVersion,
          legal.country,
        ],
        signal,
      );
    },
    command(actor, input, signal) {
      const fields = [
        'p_action',
        'p_revision',
        'p_details',
        'p_terms_version',
        'p_privacy_version',
        'p_request_id',
      ];
      if (
        !input ||
        Object.keys(input).length !== fields.length ||
        fields.some((k) => !(k in input)) ||
        !['save', 'submit'].includes(input.p_action) ||
        !(
          input.p_revision === null ||
          (Number.isSafeInteger(input.p_revision) && input.p_revision > 0)
        ) ||
        !input.p_details ||
        typeof input.p_details !== 'object' ||
        Array.isArray(input.p_details) ||
        JSON.stringify(input.p_details).length > 12000 ||
        ![input.p_terms_version, input.p_privacy_version].every(
          (v) => v === null || (typeof v === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(v)),
        ) ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          input.p_request_id || '',
        )
      )
        throw Object.assign(Error('Invalid business application command'), { status: 400 });
      return run(
        'doji_identity_resolver',
        'select portal_identity_private.business_application_command($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::uuid) as result',
        [
          ...identity(actor),
          input.p_action,
          input.p_revision,
          JSON.stringify(input.p_details),
          input.p_terms_version,
          input.p_privacy_version,
          input.p_request_id,
        ],
        signal,
      );
    },
  };
}
