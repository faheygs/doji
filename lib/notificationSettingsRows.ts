import type { NotificationPreferenceKind } from './notificationPreferences';

export type NotificationSettingsRow = {
  key: NotificationPreferenceKind;
  title: string;
  description: string;
};

const existingRows: NotificationSettingsRow[] = [
  { key: 'doji_live', title: 'Doji goes live', description: "When today's Doji goes live." },
  { key: 'friend_requests', title: 'Friend Requests', description: 'When someone sends you a friend request.' },
  {
    key: 'mentions_replies', title: 'Mentions & replies',
    description: 'When someone @mentions you or replies directly to your comment.',
  },
  {
    key: 'reviews_account', title: 'Reviews & account',
    description: 'Challenge review, moderation, and important account updates.',
  },
];

export function notificationSettingsRows(socialSettingsAvailable: boolean): NotificationSettingsRow[] {
  if (!socialSettingsAvailable) return existingRows;
  return [
    ...existingRows.slice(0, 3),
    {
      key: 'comments_on_posts', title: 'Comments on your posts',
      description: 'When someone comments on your post. Nearby activity is grouped to limit alerts.',
    },
    {
      key: 'late_friend_participation', title: 'Friends participating late',
      description: 'When friends participate after the Doji window closes. Nearby activity is grouped.',
    },
    existingRows[3],
  ];
}
