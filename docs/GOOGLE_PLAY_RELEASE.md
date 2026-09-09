# Google Play release checklist

## Application identity

- Play listing name: `Doji Connect`
- Installed product name: `Doji`
- Android package: `com.doit.challengeapp`
- Release format: Android App Bundle (`.aab`)
- Firebase project: `doji-connect`
- Privacy policy: `https://dojipro.com/privacy/`
- Terms: `https://dojipro.com/terms/`
- Community guidelines: `https://dojipro.com/community-guidelines/`
- Support: `https://dojipro.com/support/`
- Account deletion: `https://dojipro.com/delete-account/`

## Store listing draft

App name (30 characters maximum):

> Doji Connect

Short description (80 characters maximum):

> One daily challenge. Ten minutes. Share it with friends.

Full description:

> Doji gives everyone the same daily challenge and ten minutes to do it.
>
> Capture a photo or video, answer a prompt, or vote in a poll. When the window
> closes, see how your friends responded, react to their posts, join the comments,
> and follow the leaderboard.
>
> Built for real friends and real moments:
>
> - One shared challenge each day
> - Photo, video, free-text, and poll challenges
> - Reactions, comments, likes, and friend activity
> - Streaks, badges, sparks, and leaderboards
> - Notification controls and in-app activity history
> - Reporting, blocking, moderation, and account deletion controls
>
> Do it. Share it. See who showed up.

Recommended category: Social. Do not keyword-stuff the title or descriptions.

## Listing assets

- 512 x 512 PNG app icon with no transparency.
- 1024 x 500 feature graphic.
- At least two phone screenshots; prepare four to eight representative screenshots
  showing the daily challenge, participation, feed, reactions/comments, and leaderboard.
- Keep screenshots free of test accounts, private email addresses, access tokens, and
  content that has not been cleared for public marketing use.

## App content and policy answers

- App type: App; free at initial launch; no ads.
- Target audience: ages 13 and older. Do not mark the app as child-directed.
- Declare social features and third-party/user-generated content.
- Complete the content-rating questionnaire for user interaction, comments, media,
  and user-generated content.
- Provide a working production reviewer account and exact sign-in instructions under
  App access. Re-enable a hidden reviewer account before submission if necessary.
- Confirm reporting for posts/comments/poll answers, blocking from profiles, the text
  filter, moderation escalation, and account deletion before review.
- The privacy policy and Data safety form must agree. Doji does not sell data, serve
  behavioral ads, or track users across unrelated apps.

Data safety must include every applicable collected or shared category after checking
the final SDK inventory: account identifiers, name/email, photos/video, audio included
with video, free-form user content, app interactions, virtual-item ownership, crash
data, performance data, date of birth/age assurance, and device push identifiers.
Classify data by its actual retention, optionality, purpose, and whether it is linked
to the account. Confirm encryption in transit and disclose the in-app and web account
deletion paths.

## Build, signing, and push

- `google-services.json` is public Firebase client configuration and is committed with
  the app. Never commit a service-account private key.
- Supabase stores `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, and `FCM_PRIVATE_KEY` for direct
  native Android delivery.
- EAS stores the same least-privilege FCM V1 credential for Expo notification fallback.
- EAS Android build credentials contain the production upload keystore.
- Create a separate Google Play Developer API service account for automated store
  submission after the Play app exists. Do not reuse the FCM sender identity.
- Every new bundle must use a strictly increasing Android `versionCode`.

## Verification before any Play release

1. Install the exact candidate on at least two physical Android devices from a Play
   testing track, not from Expo Go.
2. Verify signup/login, terms and age assurance, camera, video/audio, photo library,
   notification permission, foreground/reconnect behavior, and account deletion.
3. Complete the realtime/push matrix in `docs/APP_STORE_RELEASE.md`, including direct
   FCM delivery, notification replacement/grouping, and deep links.
4. Verify participation succeeds before the server close boundary and fails after it.
5. Verify report/block/moderation behavior and the public safe-profile contract.
6. Confirm production health has no overdue outbox rows, exhausted shards, stale
   alarms, credential errors, or duplicate deliveries.
7. Run Expo Doctor, typecheck, lint, all Jest tests, the source-size guard, a production
   Android export, and a production dependency audit with no high or critical findings.

## Play Console sequence

1. Finish developer identity and phone verification.
2. Create the app and accept Play App Signing.
3. Complete Store listing, App content, Data safety, App access, content rating,
   target audience, ads, and account-deletion declarations.
4. Upload the production AAB to Internal testing and complete the device matrix.
5. Create a Closed testing release and keep at least 12 eligible testers opted in
   continuously for 14 days, as required for a new personal developer account.
6. Apply for production access with truthful testing and readiness answers.
7. After approval, promote the verified closed-test build or upload a newer verified
   bundle, submit it for review, and use a staged production rollout.

Google Play submission currently requires new apps and updates to target Android 16
(API level 36) or higher. Reconfirm the requirement immediately before submission:
`https://developer.android.com/google/play/requirements/target-sdk`.

