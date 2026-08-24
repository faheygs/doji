# App Store release checklist

## Build and secrets

- Ship only the Supabase URL and anon key in the client.
- Never ship service-role, Ably API, relay, or orchestrator secrets.
- Test a production-profile iOS binary on physical iPhone devices. iPad distribution
  remains disabled until the product intentionally supports and tests that layout.
- Verify camera, library, microphone, notifications, and account deletion.
- Verify `https://dojipro.com/privacy/`, `/terms/`, `/community-guidelines/`,
  `/support/`, and `/delete-account/` load publicly over HTTPS.

## Apple user-generated-content requirements

- Present separate Terms of Use and Privacy Policy checkboxes before authentication.
- Require a date of birth before credentials, reject users under 13 on both the
  client and server, and retain the self-declared date only in the private
  age-assurance audit record.
- Keep links to both complete documents before acceptance and in Settings.
- Filter objectionable text and enforce server moderation policies.
- Provide report actions for posts, comments, and poll answers.
- Provide block from profiles. Blocking instantly removes that account from the feed.
- Keep an adjacent report action so a user can send the relevant account/content and
  reason to moderation before or after blocking.
- Review reports within 24 hours and remove content/suspend offending accounts.
- Record a physical-device video showing terms acceptance, reporting, and blocking.
- Put `https://dojipro.com/privacy/` in App Store Connect's Privacy Policy URL,
  `https://dojipro.com/support/` in Support URL, and `https://dojipro.com/` in
  Marketing URL.

## App Store Connect metadata

- Keep the reserved product-page name `Doji Connect`; the installed app and product
  branding remain `Doji`.
- Mark the app as containing third-party/user-generated content.
- Answer the age-rating questionnaire as a social app with user-generated content
  and messaging/comments, not as a child-directed app. In Apple's capability step,
  answer Yes for Social Media, User-Generated Content, and Age Assurance even though
  the product blocks users under 13; that answer describes the control, not eligibility.
- Keep the privacy label inclusive of account identity, names/email, photos/video,
  audio captured with video, free-form user content, device push identifiers,
  product interactions, virtual shop ownership, crash data, and performance data.
  birth date and age-assurance record. These are linked to the account/device and
  used for App Functionality; Doji does not track users or use data for advertising.
- Use `https://dojipro.com/privacy/#choices` as the optional privacy-choices URL.
- Select only the newest verified production build and use manual release.
- Do not advertise a demo mode. The reviewer account must use the production flow
  and be tested on the exact candidate build before resubmission.
- Keep Apple Silicon Mac and Vision Pro distribution disabled until those platforms
  have their own physical compatibility pass.

## Realtime/push device matrix

- Two devices receive activation immediately without restarting.
- A background device receives push and opens the active Doji.
- Participation succeeds before the database close boundary and fails after it.
- Posts, comments, reactions, poll votes, and poll-vote likes appear on device two.
- Friend accept/remove/block updates both devices immediately.
- Disconnect/reconnect and foreground recovery reconcile without duplicate actions.
- Repeated taps and simulated response loss do not create duplicate rows.
- Notification dismiss/clear remains gone after reinstall and on a second device.
- A date exactly 13 years ago is accepted, tomorrow's 13th birthday is rejected, the
  submitted date exists in the private assurance row, and no birth-date field exists
  on the resulting profile or public profile response.

## Production verification

1. `npx supabase db push --linked --dry-run` reports no unexpected migration.
2. `npx supabase db lint --linked --level warning` reports no findings.
3. Deploy `realtime-token`, `relay-domain-events`, `orchestrate-doji`,
   `schedule-daily-challenge`, `fanout-doji-push`, and `run-data-maintenance`.
4. Configure and verify the production APNs key/team/bundle secrets. Confirm a new
   production build registers a native endpoint before testing a global launch.
5. Deploy `infra/doji-orchestrator` and verify queue/dead-letter bindings.
6. Confirm there are no recurring `doji_*` pg_cron jobs.
7. Confirm outbox rows publish promptly and the dead-letter queue remains empty.
8. Run the complete physical-device matrix before submitting.

## Required before public production

Automated and infrastructure gates:

- [x] Production migrations match the repository and database lint is clean.
- [x] Required Supabase Edge Functions and the Cloudflare orchestrator are deployed.
- [x] Cloudflare primary and dead-letter queues are bound to the production worker.
- [x] Resend-backed operational health alerts are enabled and hourly-deduplicated.
- [x] Sentry DSN/source-map credentials are present in EAS production; realtime
      authentication, connection, and subscription failures are captured without PII.
- [x] Direct APNs credentials are installed for the iOS release. FCM remains an
      Android-release gate and does not block the current iPhone-only App Store release.
- [x] EAS production contains only the current Supabase/Sentry configuration; retired
      Railway, R2, Typesense, Google-auth, and legacy socket variables are removed.
- [x] The checked-in 30/60/120-second 100k burst capacity model passes.
- [x] The production database enforces that no recurring `doji_*` pg_cron jobs remain.
- [x] Full validation commands and the production Expo export pass on this release
      candidate; the production dependency audit has zero high or critical findings.

Exact release-build gates (cannot be inferred from unit tests):

- [x] Install the candidate through TestFlight on at least two physical iPhones.
- [x] Complete the realtime/push device matrix above, including background and
      reconnect recovery, notification deduplication, and the close boundary.
- [ ] Confirm the candidate registers a production native APNs endpoint.
- [ ] Record Apple's physical-device UGC review video and attach it to Review Notes.
