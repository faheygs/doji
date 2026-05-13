import type { TextStyle, ViewStyle } from 'react-native';
import { Platform } from 'react-native';

export const webRootViewStyle: ViewStyle | undefined =
  Platform.OS === 'web'
    ? ({ flex: 1, minHeight: '100vh' } as unknown as ViewStyle)
    : undefined;

export const webScrollParentStyle: ViewStyle | undefined =
  Platform.OS === 'web' ? { flex: 1, minHeight: 0 } : undefined;

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------
export const Brand = {
  orange: '#F97316',
  violet: '#8B5CF6',
  gradientMid: '#A78BFA',
} as const;

export const BrandWordmark: { header: TextStyle; hero: TextStyle } = {
  header: {
    fontFamily: 'DojiWordmark',
    fontSize: 28,
    letterSpacing: -0.85,
  },
  hero: {
    fontFamily: 'DojiWordmark',
    fontSize: 34,
    letterSpacing: -1.05,
  },
};

// ---------------------------------------------------------------------------
// Spacing (base 4px)
// ---------------------------------------------------------------------------
export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// ---------------------------------------------------------------------------
// Border Radius (per spec)
// ---------------------------------------------------------------------------
export const Radius = {
  xs: 10,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  full: 999,
} as const;

// ---------------------------------------------------------------------------
// Typography — Plus Jakarta Sans
// ---------------------------------------------------------------------------
export const Typography = {
  display: {
    fontSize: 28,
    fontWeight: '800' as const,
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 20,
    fontWeight: '800' as const,
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  heading: {
    fontSize: 18,
    fontWeight: '800' as const,
    lineHeight: 24,
  },
  subhead: {
    fontSize: 16,
    fontWeight: '700' as const,
    lineHeight: 22,
  },
  body: {
    fontSize: 14,
    fontWeight: '700' as const,
    lineHeight: 20,
  },
  caption: {
    fontSize: 13,
    fontWeight: '600' as const,
    lineHeight: 18,
  },
  micro: {
    fontSize: 12,
    fontWeight: '700' as const,
    lineHeight: 16,
  },
  nano: {
    fontSize: 10,
    fontWeight: '600' as const,
    lineHeight: 14,
    letterSpacing: 0.5,
  },

  // Legacy compat aliases
  displayLarge: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5 },
  displayMedium: { fontSize: 20, fontWeight: '800' as const, letterSpacing: -0.3 },
  headingLarge: { fontSize: 18, fontWeight: '800' as const },
  headingMedium: { fontSize: 16, fontWeight: '700' as const },
  bodySmall: { fontSize: 13, fontWeight: '600' as const, lineHeight: 18 },
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.8 },
} as const;

// ---------------------------------------------------------------------------
// Shadows
// ---------------------------------------------------------------------------
export const Shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOpacity: 0.04,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: 3 },
    default: {},
  }),
  cardDark: Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: 4 },
    default: {},
  }),
} as const;

// ---------------------------------------------------------------------------
// Color Tokens
// ---------------------------------------------------------------------------
export type AppColors = {
  // Core
  primary: string;
  primaryHover: string;
  primaryLight: string;
  primaryPale: string;
  accent: string;
  accentLight: string;
  success: string;
  successLight: string;
  danger: string;
  warning: string;

  // Surfaces
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;

  // Text
  text: string;
  textSecondary: string;
  textTertiary: string;
  onPrimary: string;
  onAccent: string;

  // Borders
  border: string;
  borderLight: string;
  hairline: string;

  // Gamification
  xpGradientStart: string;
  xpGradientEnd: string;

  // Legacy compat
  link: string;
  error: string;
  chipBackground: string;
  fillMuted: string;
  accentGlow: string;
  surfaceRaised: string;
};

// ---- Coral (default light) ----
export const coralColors: AppColors = {
  primary: '#F97316',
  primaryHover: '#EA580C',
  primaryLight: '#FFF7ED',
  primaryPale: '#FFEDD5',
  accent: '#8B5CF6',
  accentLight: '#EDE9FE',
  success: '#10B981',
  successLight: '#D1FAE5',
  danger: '#EF4444',
  warning: '#F59E0B',

  background: '#FAFAF9',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#F5F5F4',

  text: '#1C1917',
  textSecondary: '#57534E',
  textTertiary: '#A8A29E',
  onPrimary: '#FFFFFF',
  onAccent: '#FFFFFF',

  border: '#E7E5E4',
  borderLight: '#F5F5F4',
  hairline: '#E7E5E4',

  xpGradientStart: '#F97316',
  xpGradientEnd: '#8B5CF6',

  link: '#F97316',
  error: '#EF4444',
  chipBackground: 'rgba(0,0,0,0.04)',
  fillMuted: '#F5F5F4',
  accentGlow: 'rgba(249,115,22,0.15)',
  surfaceRaised: '#FFFFFF',
};

// ---- Ocean ----
export const oceanColors: AppColors = {
  ...coralColors,
  primary: '#3B82F6',
  primaryHover: '#2563EB',
  primaryLight: '#EFF6FF',
  primaryPale: '#DBEAFE',
  accent: '#06B6D4',
  accentLight: '#CFFAFE',

  xpGradientStart: '#3B82F6',
  xpGradientEnd: '#06B6D4',

  link: '#3B82F6',
  accentGlow: 'rgba(59,130,246,0.15)',
};

// ---- Midnight (dark) ----
export const midnightColors: AppColors = {
  primary: '#F97316',
  primaryHover: '#EA580C',
  primaryLight: 'rgba(249,115,22,0.12)',
  primaryPale: 'rgba(249,115,22,0.08)',
  accent: '#A78BFA',
  accentLight: 'rgba(167,139,250,0.12)',
  success: '#34D399',
  successLight: 'rgba(52,211,153,0.12)',
  danger: '#EF4444',
  warning: '#F59E0B',

  background: '#0C0C0D',
  surface: '#1A1A1C',
  surfaceElevated: '#1A1A1C',
  surfaceMuted: '#27272A',

  text: '#FAFAFA',
  textSecondary: '#A1A1AA',
  textTertiary: '#71717A',
  onPrimary: '#FFFFFF',
  onAccent: '#FFFFFF',

  border: '#27272A',
  borderLight: '#1F1F23',
  hairline: '#27272A',

  xpGradientStart: '#F97316',
  xpGradientEnd: '#A78BFA',

  link: '#F97316',
  error: '#EF4444',
  chipBackground: 'rgba(255,255,255,0.06)',
  fillMuted: '#27272A',
  accentGlow: 'rgba(249,115,22,0.22)',
  surfaceRaised: '#1A1A1C',
};

// ---- Forest ----
export const forestColors: AppColors = {
  ...coralColors,
  primary: '#059669',
  primaryHover: '#047857',
  primaryLight: '#ECFDF5',
  primaryPale: '#D1FAE5',
  accent: '#D97706',
  accentLight: '#FEF3C7',

  xpGradientStart: '#059669',
  xpGradientEnd: '#D97706',

  link: '#059669',
  accentGlow: 'rgba(5,150,105,0.15)',
};

export type ThemeName = 'coral' | 'ocean' | 'midnight' | 'forest';

/** Used for new installs and before the user picks a theme in Settings. */
export const DEFAULT_APP_THEME: ThemeName = 'midnight';

export const themeMap: Record<ThemeName, AppColors> = {
  coral: coralColors,
  ocean: oceanColors,
  midnight: midnightColors,
  forest: forestColors,
};

export function isDarkTheme(name: ThemeName): boolean {
  return name === 'midnight';
}

export const THEME_NAME_LIST = Object.keys(themeMap) as ThemeName[];

/** Coerce stored profile value to a valid client theme. */
export function normalizeAppTheme(raw: unknown): ThemeName {
  if (typeof raw === 'string' && (THEME_NAME_LIST as readonly string[]).includes(raw)) {
    return raw as ThemeName;
  }
  return DEFAULT_APP_THEME;
}

// ---------------------------------------------------------------------------
// XP Level thresholds
// ---------------------------------------------------------------------------
export const XP_LEVELS: number[] = [
  0,      // Level 1
  500,    // Level 2
  1200,   // Level 3
  2000,   // Level 4
  3000,   // Level 5
  4500,   // Level 6
  6500,   // Level 7
  9000,   // Level 8
  12000,  // Level 9
  16000,  // Level 10
];

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level > XP_LEVELS.length) return XP_LEVELS[XP_LEVELS.length - 1];
  return XP_LEVELS[level - 1];
}

export function xpToNextLevel(currentXp: number, currentLevel: number): { current: number; max: number } {
  const thisLevelXp = xpForLevel(currentLevel);
  const nextLevelXp = xpForLevel(currentLevel + 1);
  if (nextLevelXp <= thisLevelXp) return { current: currentXp - thisLevelXp, max: 1 };
  return {
    current: currentXp - thisLevelXp,
    max: nextLevelXp - thisLevelXp,
  };
}

// ---------------------------------------------------------------------------
// XP Rewards
// ---------------------------------------------------------------------------
export const XP_REWARDS = {
  photo: 50,
  poll: 25,
  task: 35,
  streak_bonus: 10,
} as const;

// ---------------------------------------------------------------------------
// Reaction config
// ---------------------------------------------------------------------------
export const REACTION_EMOJIS = ['fire', 'like', 'laugh', 'wow', 'love'] as const;
export const REACTION_DISPLAY: Record<string, string> = {
  fire: '🔥',
  laugh: '😂',
  wow: '😮',
  love: '❤️',
};

// ---------------------------------------------------------------------------
// Category helpers (kept for backward compat)
// ---------------------------------------------------------------------------
export const CategoryLetters: Record<string, string> = {
  physical: 'P',
  creative: 'C',
  social: 'S',
  mental: 'M',
  wild: 'W',
};

export const CategoryEmojis: Record<string, string> = {
  physical: '💪',
  creative: '🎨',
  social: '🤝',
  mental: '🧠',
  wild: '🌪️',
};

// Legacy aliases
export const darkColors = midnightColors;
export const lightColors = coralColors;
export const Colors = midnightColors;

export function getCategoryColors(_colors: AppColors): Record<string, string> {
  return {
    physical: '#FF7A45',
    creative: '#A78BFA',
    social: '#38BDF8',
    mental: '#34D399',
    wild: '#FBBF24',
  };
}
