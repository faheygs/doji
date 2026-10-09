# Connected announcement migration — acceptance deployment

## Status

Owner separately approved gated employee-only backend deployment on October 9.
Deployed and verified at /connected around 20:20 UTC. The default legacy portal is
unchanged. No announcements were created, published, scheduled, cancelled or emailed.
Owner declined the live draft test and approved commit/merge and root promotion.
Live writes remain untested, not passed. Root-only package qualification passed 10
focused browser checks; promotion evidence is test-results/react-admin-root-20261009.

## October 9 release evidence

- Pages deployment: 4b4be320-a891-42d1-aaff-9e375b254775.
- Employee runtime: v15 captured; v16 deployed disabled and verified; v17 enabled and
  verified from downloaded source. No secrets/config values or other functions changed.
- Two additive SQL functions installed in one bounded transaction. Existing function,
  relation/grant/policy/role/settings fingerprint unchanged; member execution denied.
- Exact packages share the same application bytes and differ only in the client flag.
  135 gate-off browser tests and 5 gate-on announcement tests passed. Preview-only
  cases within the broad suite still exercise local preview assets, not hosted routes.
- Narrow runtime backport preserves deployed staff override and all unrelated source.
  80 security/transport checks passed against emitted runtime modules. Broader local
  health/business runtime differences were deliberately not bundled into this release.
- Portal/tooling types, lint, source-size and whitespace checks passed. Corrected the
  intentionally invalid MFA test fixture's TypeScript expected-error annotation.
- Initial public asset verification saw one transient AnnouncementEditor hash mismatch.
  A diagnostic read matched exactly; a subsequent full read-only verification passed.
  No deploy retry or mutation was used to recover; exact cause was not established.
- Hosted Chrome: existing employee session restored; Home and announcement list loaded;
  queue status connected; New announcement form rendered with save/publish controls.
  These read-only checks do not establish live write/delivery success.
- Evidence root: test-results/react-admin-announcements-20261009, including per-package
  manifests, runtime source downloads, database verification and release-verified.json.
- Rollback runtime: employee-before under that evidence root (v15 source). To disable
  composition while preserving this patch, use the exact employee-off package (v16).
  Rollback portal: test-results/react-admin-hosted-20261009-v4/site.
- Release preparation/qualification and deployment are in three explicit scripts:
  qualify-react-admin-announcements.mts, prepare-announcement-runtime.mts, and
  release-announcement-acceptance.mts. They refuse uncertain-write replay.

The remaining sections document implementation and the original local qualification.
Their original default-off status is superseded only for this scoped acceptance release.

## Implemented

- Gated React new/edit routes using standard MUI fields, date pickers and confirmation.
- Full draft hydration from the actual authorized RPC: can_write, managed lifecycle,
  version and complete reward/display fields. The deployed announcement RPC does not
  return allowed_actions; legal UI actions follow its documented lifecycle. A future
  narrower server action list is respected if present.
- The revision is pinned with the loaded form fields. Background refresh cannot pair
  unsaved edits with another employee's newer version.
- One atomic compose request for save draft, publish now or schedule. Publish now
  omits starts_at; the server owns the publication start.
- Cancellation uses the existing audited editorial command, with explicit confirmation
  and an actual 8–1,000-character cancellation reason.
- Session-owned immutable intent coalesces duplicate clicks and survives route changes.
  Unknown results retain the same payload/key and permit only an explicit identical
  retry. A definite rejection requires returning to the record before another attempt.
- Sign-out, expiry and changed identity/permissions dispose pending client state and
  fence late results. Pending writes warn before unloading across routes. No sensitive
  browser persistence was added: forced reload/closing the browser still loses the
  memory-only intent. Check authoritative records before creating another announcement.
- Original compose receipts are not presented as current announcement status or proof
  of member delivery. Current status is read again after a confirmed command.
- Existing announcement/audit TanStack areas are invalidated after confirmed writes.
  Existing identifier-only announcement hints and foreground/reconnect reconciliation
  remain unchanged. No timers, polling, new socket channel or optimistic member data.

## Employee-only bridge and gates

Browser/session config: announcementComposeEnabled defaults false.
Employee server runtime config: announcementComposeEnabled independently defaults false
inside the existing EMPLOYEE_V2_CONFIG object. No live config was modified.

The new fixed /announcements/compose browser mapping selects only
admin_announcement_compose_v1. The employee adapter calls a separately prepared fixed
employee_announcement_rpc_v1 bridge, never the shared member Worker dispatcher.
The bridge resolves the verified external employee identity, requires MFA, restores
prior claims on success/failure, and executes the single atomic compose command.
Existing SQL functions and member grants are not replaced.

Legacy announcement SQLSTATE 40001/version conflicts and P0001/validation failures
are sanitized and mapped to definite 409/400 responses for announcement writes only.
Other operations retain their existing adapter classification.

## Verification

- 230 web unit tests, including exact retry, session fencing, concurrent edit revision
  pinning, wrong receipt rejection, cancellation and read-only denial.
- 80 employee adapter, transport, runtime boundary and restricted-SQL tests.
- Offline network-disabled disposable database: 290 migrations replayed; atomic
  lifecycle/replay/member eligibility tests; bridge actor/MFA/role/injection denial,
  claim restoration, one-record exact retry and inverse rollback. Existing functions,
  grants, policies and member rows fingerprinted unchanged.
- Broad browser regression: 139 portal checks passed. One unrelated website color
  check initially failed because port 4312 was not running, then passed after starting
  the local preview. Final focused announcement/shared-theme suite additionally covers
  new publication, draft save, cancellation, navigation during uncertainty and conflicts.
- Typecheck, lint, source-size guard, preview and connected builds passed.
- Preview: 403.2 KiB gzip. Connected total: 501.4 KiB gzip, with 46.8 KiB deferred
  announcement editor/record/command. Explicit feature allocation increases the total
  cap by 50 KiB to 507; core, shared-library and 180 KiB sign-in caps remain.
  Actual sign-in entry: 167.3 KiB. No new dependency, external service or paid setting.

## Release sequence — approval still required

1. Qualify an exact packaged release with production-equivalent configuration against
   intercepted APIs, including both gate-off and gate-on behavior. Review the final diff.
2. Obtain separate shared-system production approval. This adds two employee-only SQL
   functions and updates the employee runtime adapter; it does not alter member auth,
   challenge timing, push delivery or announcement eligibility/reward semantics.
3. Preserve the currently deployed portal/runtime packages and configuration. Deploy
   docs/drafts/employee_announcement_compose_v1.sql, then
   docs/drafts/employee_announcement_bridge_v1.sql under bounded release checks.
4. Deploy the employee runtime with the server compose flag initially false. Deploy the
   portal package without replacing the default legacy entry. Enable the two flags
   only within the approved release window after backend checks pass.
5. Hosted read-only acceptance does not authorize creating a real announcement.
   Synthetic live write acceptance requires separately bounded owner authorization.
6. Switch the default portal only after full announcement acceptance, other migration
   parity checks, owner approval and a verified rollback package.

## Rollback

Disable the client and server compose flags; restore the previous employee runtime
and portal artifacts/configuration. Do not remove or rewrite announcement records,
audit history or command receipts. If removing added SQL, apply
employee_announcement_bridge_v1.rollback.sql before
employee_announcement_compose_v1.rollback.sql. Offline checks verify existing
functions/grants/member data remain unchanged. These are rollback candidates, not
authorization to run destructive or production commands.
