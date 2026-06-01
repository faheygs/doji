import React from 'react';
import { BadgeUnlockModal } from './BadgeUnlockModal';
import { useCelebrationStore } from '../../stores/useCelebrationStore';

export function CelebrationHost() {
  const badge = useCelebrationStore((s) => s.badge);
  const dismissBadgeUnlock = useCelebrationStore((s) => s.dismissBadgeUnlock);

  return (
    <BadgeUnlockModal
      visible={badge !== null}
      categoryId={badge?.categoryId ?? ''}
      name={badge?.name ?? ''}
      tier={badge?.tier ?? 'bronze'}
      unlockedTiers={badge?.unlockedTiers ?? []}
      onDismiss={dismissBadgeUnlock}
    />
  );
}
