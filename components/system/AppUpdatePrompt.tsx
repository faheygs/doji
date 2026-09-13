import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { useAppUpdatePolicy } from '../../hooks/useAppUpdatePolicy';
import {
  assessAppUpdate,
  type InstalledRelease,
  type MobilePlatform,
  updateDismissalKey,
} from '../../lib/appUpdate';
import { AppDialog } from '../ui/AppDialog';

const OPTIONAL_REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1_000;

function currentPlatform(): MobilePlatform | null {
  if (Platform.OS === 'ios' || Platform.OS === 'android') return Platform.OS;
  return null;
}

function installedRelease(platform: MobilePlatform | null): InstalledRelease {
  const fallbackBuild =
    platform === 'ios'
      ? Constants.expoConfig?.ios?.buildNumber
      : platform === 'android'
        ? Constants.expoConfig?.android?.versionCode
        : 0;
  return {
    version: Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? '0.0.0',
    build: Number.parseInt(String(Constants.nativeBuildVersion ?? fallbackBuild ?? 0), 10) || 0,
  };
}

export function AppUpdatePrompt({ enabled }: { enabled: boolean }) {
  const platform = currentPlatform();
  const installed = useMemo(() => installedRelease(platform), [platform]);
  const { data: policy } = useAppUpdatePolicy(enabled);
  const decision = useMemo(() => assessAppUpdate(installed, policy ?? null), [installed, policy]);
  const [visible, setVisible] = useState(false);
  const [storeOpenFailed, setStoreOpenFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !platform || !policy || !decision.available) {
      setVisible(false);
      return () => {
        cancelled = true;
      };
    }
    if (decision.required) {
      setVisible(true);
      return () => {
        cancelled = true;
      };
    }

    const key = updateDismissalKey(platform, policy);
    void AsyncStorage.getItem(key)
      .then((value) => {
        if (cancelled) return;
        const dismissedAt = Number(value ?? 0);
        setVisible(!dismissedAt || Date.now() - dismissedAt >= OPTIONAL_REMINDER_INTERVAL_MS);
      })
      .catch(() => {
        if (!cancelled) setVisible(true);
      });
    return () => {
      cancelled = true;
    };
  }, [decision.available, decision.required, enabled, platform, policy]);

  if (!platform || !policy || !decision.available) return null;

  const rememberOptionalDismissal = () => {
    if (!decision.required) {
      void AsyncStorage.setItem(updateDismissalKey(platform, policy), String(Date.now())).catch(
        () => {},
      );
    }
    setVisible(false);
  };

  const openStore = async () => {
    setStoreOpenFailed(false);
    try {
      await Linking.openURL(policy.store_url);
      if (!decision.required) rememberOptionalDismissal();
    } catch {
      setStoreOpenFailed(true);
      setVisible(true);
    }
  };

  const storeName = platform === 'ios' ? 'App Store' : 'Play Store';
  const defaultMessage = decision.required
    ? `This version of Doji is no longer supported. Update from the ${storeName} to continue.`
    : `A newer version of Doji is ready. Update from the ${storeName} for the latest fixes and improvements.`;
  const message = storeOpenFailed
    ? `The ${storeName} did not open. Open it directly, search for Doji Connect, and tap Update.`
    : policy.update_message?.trim() || defaultMessage;

  return (
    <AppDialog
      visible={visible}
      title={storeOpenFailed ? 'Open the store to update' : decision.required ? 'Update required' : 'Update available'}
      message={message}
      actions={[
        { label: 'Update now', onPress: () => void openStore() },
        ...(decision.required
          ? []
          : [{ label: 'Not now', variant: 'cancel' as const, onPress: rememberOptionalDismissal }]),
      ]}
      dismissible={!decision.required}
      onDismiss={rememberOptionalDismissal}
    />
  );
}
