# App Store release checklist

## Build and secrets

- Ship only the Supabase URL and anon key in the client.
- Never ship service-role, Ably API, relay, or orchestrator secrets.
- Test a production-profile iOS binary on physical iPhone and iPad devices.
- Verify camera, library, microphone, notifications, and account deletion.
- Verify `https://dojipro.com/privacy/`, `/terms/`, `/community-guidelines/`,
  `/support/`, and `/delete-account/` load publicly over HTTPS.

## Apple user-generated-content requirements

- Present separate Terms of Use and Privacy Policy checkboxes before authentication.
- Keep links to both complete documents before acceptance and in Settings.
- Filter objectionable text and enforce server moderation policies.
- Provide report actions for posts, comments, and poll answers.
- Provide block from profiles. Blocking instantly removes that account from the feed
  and creates a pending developer moderation report.
- Review reports within 24 hours and remove content/suspend offending accounts.
- Record a physical-device video showing terms acceptance, reporting, and blocking.
- Put `https://dojipro.com/privacy/` in App Store Connect's Privacy Policy URL,
  `https://dojipro.com/support/` in Support URL, and `https://dojipro.com/` in
  Marketing URL.

## Realtime/push device matrix

- Two devices receive activation immediately without restarting.
- A background device receives push and opens the active Doji.
- Participation succeeds before the database close boundary and fails after it.
- Posts, comments, reactions, poll votes, and poll-vote likes appear on device two.
- Friend accept/remove/block updates both devices immediately.
- Disconnect/reconnect and foreground recovery reconcile without duplicate actions.
- Repeated taps and simulated response loss do not create duplicate rows.
- Notification dismiss/clear remains gone after reinstall and on a second device.

## Production verification

1. `npx supabase db push --linked --dry-run` reports no unexpected migration.
2. `npx supabase db lint --linked --level warning` reports no findings.
3. Deploy `realtime-token`, `relay-domain-events`, `orchestrate-doji`, and
   `schedule-daily-challenge`.
4. Deploy `infra/doji-orchestrator` and verify queue/dead-letter bindings.
5. Confirm there are no recurring `doji_*` pg_cron jobs.
6. Confirm outbox rows publish promptly and the dead-letter queue remains empty.
7. Run the complete physical-device matrix before submitting.
