import React, { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { AppDialog } from '../ui/AppDialog';
import { useAppAnnouncement } from '../../hooks/useAppAnnouncement';
import { normalizeHref, safeReplace } from '../../lib/routes';

const PARTICIPATION_PATHS = new Set([
  '/challenge', '/camera', '/poll', '/task', '/format',
  '/(app)/challenge', '/(app)/camera', '/(app)/poll', '/(app)/task', '/(app)/format',
]);

export function AppAnnouncementPrompt({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [settled, setSettled] = useState(false);
  const participating = PARTICIPATION_PATHS.has(pathname);
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => setSettled(true), 2_500);
    return () => clearTimeout(timer);
  }, [enabled]);
  const { data, recordAction } = useAppAnnouncement(enabled && settled && !participating);

  if (!data || participating) return null;
  const ctaUrl = data.cta_url;
  const close = () => void recordAction({ id: data.id, action: 'dismissed' });
  return (
    <AppDialog
      visible
      title={data.title}
      message={data.body}
      dismissible
      onDismiss={close}
      layout="stacked"
      actions={[
        ...(data.cta_label && ctaUrl
          ? [{
              label: data.cta_label,
              onPress: async () => {
                await recordAction({ id: data.id, action: 'cta' });
                const inApp = normalizeHref(ctaUrl);
                if (inApp) safeReplace(router, inApp);
                else if (ctaUrl.startsWith('https://')) await Linking.openURL(ctaUrl);
              },
            }]
          : []),
        { label: 'Not now', variant: 'cancel' as const, onPress: close },
      ]}
    />
  );
}
