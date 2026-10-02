import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const DEFAULT_LIMIT = 240;

// Existing decomposition debt is frozen at today's size: these files may shrink,
// but CI will reject growth. Remove entries as each feature is split below 240.
const legacyLimits = new Map(Object.entries({
  'hooks/useNotificationCenter.ts': 960,
  'app/(app)/camera.tsx': 737,
  'components/feed/PollResultCard.tsx': 697,
  'app/(app)/(tabs)/suggest-challenge.tsx': 630,
  'app/(app)/(tabs)/index.tsx': 508,
  'constants/theme.ts': 497,
  'app/(app)/profile/settings.tsx': 482,
  'components/feed/PostCard.tsx': 472,
  'components/gamification/BadgesGrid.tsx': 471,
  'app/(app)/member/[username].tsx': 469,
  'components/icons/BadgeIcons.tsx': 448,
  'components/feed/PostCommentsSheet.tsx': 425,
  'app/(app)/notifications.tsx': 411,
  'components/challenge/ChallengeBanner.tsx': 405,
  'components/icons/Icons.tsx': 392,
  'app/(app)/challenge.tsx': 388,
  'app/(auth)/login.tsx': 386,
  'components/profile/ProfileSections.tsx': 385,
  'app/(app)/poll.tsx': 360,
  'components/reactions/ReactionVotersSheet.tsx': 333,
  'app/_layout.tsx': 312,
  'app/(app)/profile/shop.tsx': 307,
  'app/(app)/admin/reports.tsx': 284,
  'hooks/useComments.ts': 282,
  'app/(app)/admin/suggestions.tsx': 280,
  'app/(auth)/username.tsx': 275,
  'components/feed/CommentLikesSheet.tsx': 269,
  'components/leaderboard/PodiumTopThree.tsx': 268,
  'components/feed/ReactionBar.tsx': 266,
  'app/(app)/format.tsx': 257,
  'infra/doji-orchestrator/src/index.ts': 620,
  'supabase/functions/fanout-doji-push/index.ts': 430,
  // Owner-approved October 2, 2026 exceptions: defer refactoring these 15
  // files, but freeze their current sizes. Coverage/test gates are unchanged.
  'supabase/functions/_shared/business-auth.ts': 391,
  'supabase/functions/_shared/doji-email.ts': 246,
  'app/(app)/(tabs)/friends.tsx': 264,
  'app/(app)/(tabs)/rank.tsx': 354,
  'app/(app)/profile/account-status.tsx': 292,
  'components/feed/PostCommentsThread.tsx': 899,
  'components/feed/ReportSheet.tsx': 435,
  'components/notifications/NotificationSheet.tsx': 589,
  'infra/doji-orchestrator/src/operational-health.ts': 243,
  'infra/doji-orchestrator/src/portal-read.ts': 629,
  'lib/pushNotifications.ts': 267,
  'stores/useAuthStore.ts': 253,
  'supabase/functions/relay-domain-events/index.ts': 879,
  'supabase/functions/run-data-maintenance/index.ts': 259,
  'supabase/functions/send-admin-email/index.ts': 422,
}));

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
}).split(/\r?\n/).filter((file) =>
  /^(app|components|hooks|lib|stores|contexts|utils|constants|contracts|infra\/doji-orchestrator\/src|supabase\/functions)\/.+\.tsx?$/.test(file),
);

const failures = [];
for (const file of files) {
  if (!existsSync(file)) continue;
  const source = readFileSync(file, 'utf8');
  const lines = source.length === 0 ? 0 : source.split(/\r?\n/).length - (source.endsWith('\n') ? 1 : 0);
  const limit = legacyLimits.get(file) ?? DEFAULT_LIMIT;
  if (lines > limit) failures.push(`${file}: ${lines} lines (limit ${limit})`);
}

if (failures.length) {
  console.error(`Source-size guard failed:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`Source-size guard passed (${DEFAULT_LIMIT}-line default; legacy files cannot grow).`);
