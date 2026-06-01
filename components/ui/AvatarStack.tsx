import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Avatar } from './Avatar';

type StackUser = {
  avatar_url?: string | null;
  username?: string | null;
};

type Props = {
  users: StackUser[];
  size?: number;
  max?: number;
  borderColor: string;
};

export function AvatarStack({ users, size = 36, max = 3, borderColor }: Props) {
  const shown = users.slice(0, max);
  const overlap = Math.round(size * 0.32);
  const width = size + Math.max(0, shown.length - 1) * (size - overlap);

  return (
    <View style={[styles.row, { width, height: size }]}>
      {shown.map((user, index) => (
        <View
          key={`${user.username ?? 'user'}-${index}`}
          style={[
            styles.avatarWrap,
            {
              left: index * (size - overlap),
              zIndex: shown.length - index,
              width: size,
              height: size,
              borderRadius: size / 2,
              borderColor,
            },
          ]}
        >
          <Avatar
            uri={user.avatar_url}
            username={user.username ?? '?'}
            size={size - 4}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'relative',
  },
  avatarWrap: {
    position: 'absolute',
    top: 0,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
