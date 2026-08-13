import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { resolveAvatarBorderColor, resolveAvatarBorderWidth } from '../../lib/cosmetics';
import type { Profile } from '../../types/database';
import { Avatar } from './Avatar';

type AvatarProfile = Pick<Profile, 'avatar_url' | 'username' | 'display_name'> & {
  equipped_border_key?: string | null;
};

type Props = {
  profile: AvatarProfile | null | undefined;
  size?: number;
  style?: StyleProp<ViewStyle>;
  rankBorderColor?: string;
};

/** The canonical avatar renderer for a profile, including its equipped frame. */
export function ProfileAvatar({ profile, size = 40, style, rankBorderColor }: Props) {
  const cosmetics = { equipped_border_key: profile?.equipped_border_key ?? null };
  return (
    <Avatar
      uri={profile?.avatar_url}
      username={profile?.display_name ?? profile?.username ?? undefined}
      size={size}
      style={style}
      borderColor={resolveAvatarBorderColor(cosmetics, rankBorderColor)}
      borderWidth={resolveAvatarBorderWidth(cosmetics)}
    />
  );
}
