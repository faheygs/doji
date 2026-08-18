import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const DEFAULT_LIMIT = 240;

// Existing decomposition debt is frozen at today's size: these files may shrink,
// but CI will reject growth. Remove entries as each feature is split below 240.
const legacyLimits = new Map(Object.entries({
  'hooks/useNotificationCenter.ts': 960,
  'components/feed/PostCommentsThread.tsx': 893,
  'app/(app)/camera.tsx': 737,
  'components/feed/PollResultCard.tsx': 697,
  'app/(app)/suggest-challenge.tsx': 630,
  'components/notifications/NotificationSheet.tsx': 582,
  'app/(app)/index.tsx': 508,
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
  'app/(app)/rank/index.tsx': 347,
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
  'app/(app)/friends/index.tsx': 256,
}));

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
}).split(/\r?\n/).filter((file) => /^(app|components|hooks|lib|stores|contexts|utils)\/.+\.tsx?$/.test(file));

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
