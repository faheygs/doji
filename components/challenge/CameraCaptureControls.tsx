import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Spacing } from '../../constants/theme';
import { IconBolt, IconClose, IconFlipCamera } from '../icons/Icons';
import { Text } from '../ui/Text';
import { ChallengeTimer } from './ChallengeTimer';

type TopProps = {
  flashEnabled: boolean;
  flashAvailable: boolean;
  expiresAt: string | null;
  onClose: () => void;
  onFlip: () => void;
  onToggleFlash: () => void;
  onExpire: () => void;
  color: string;
};

export function CameraTopControls({
  flashEnabled,
  flashAvailable,
  expiresAt,
  onClose,
  onFlip,
  onToggleFlash,
  onExpire,
  color,
}: TopProps) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.iconButton} accessibilityLabel="Close camera">
        <IconClose size={26} color={color} />
      </TouchableOpacity>
      <View style={styles.headerActions}>
        <TouchableOpacity
          onPress={onToggleFlash}
          disabled={!flashAvailable}
          style={[styles.iconButton, !flashAvailable && styles.disabled]}
          accessibilityLabel={flashEnabled ? 'Turn flash off' : 'Turn flash on'}
        >
          <IconBolt size={22} color={flashEnabled ? '#FFD43B' : color} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onFlip} style={styles.iconButton} accessibilityLabel="Flip camera">
          <IconFlipCamera size={24} color={color} />
        </TouchableOpacity>
        <ChallengeTimer expiresAt={expiresAt} onExpire={onExpire} />
      </View>
    </View>
  );
}

export function CameraZoomControls({
  zoom,
  onChange,
  color,
}: {
  zoom: number;
  onChange: (zoom: number) => void;
  color: string;
}) {
  const decrease = () => onChange(Math.max(0, Number((zoom - 0.1).toFixed(1))));
  const increase = () => onChange(Math.min(1, Number((zoom + 0.1).toFixed(1))));
  return (
    <View style={styles.zoomRow} accessibilityLabel={`Camera zoom ${Math.round(zoom * 100)} percent`}>
      <TouchableOpacity onPress={decrease} disabled={zoom <= 0} style={styles.zoomButton} accessibilityLabel="Zoom out">
        <Text variant="headingMedium" color={color}>−</Text>
      </TouchableOpacity>
      <Text variant="label" color={color}>{zoom === 0 ? '1×' : `${(1 + zoom * 2).toFixed(1)}×`}</Text>
      <TouchableOpacity onPress={increase} disabled={zoom >= 1} style={styles.zoomButton} accessibilityLabel="Zoom in">
        <Text variant="headingMedium" color={color}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00000066' },
  disabled: { opacity: 0.35 },
  zoomRow: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.sm, borderRadius: 24, backgroundColor: '#00000066' },
  zoomButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
