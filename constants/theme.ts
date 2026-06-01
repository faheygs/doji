import type { TextStyle, ViewStyle } from 'react-native';
import { Platform } from 'react-native';

export const webRootViewStyle: ViewStyle | undefined =
  Platform.OS === 'web' ? ({ flex: 1, minHeight: '100vh' } as unknown as ViewStyle) : undefined;

export const webScrollParentStyle: ViewStyle | undefined =
  Platform.OS === 'web' ? { flex: 1, minHeight: 0 } : undefined;

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------
export const Brand = {
  orange: '#FF6B35',
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
      shadowOpacity: 0.07,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
    },
    android: { elevation: 4 },
    default: {},
  }),
  cardDark: Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOpacity: 0.35,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
    },
    android: { elevation: 5 },
    default: {},
  }),
} as const;

// ---------------------------------------------------------------------------
// Color Tokens
// ---------------------------------------------------------------------------
export type AppColors = {
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
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  onPrimary: string;
  onAccent: string;
  border: string;
  borderLight: string;
  hairline: string;
  xpGradientStart: string;
  xpGradientEnd: string;
  link: string;
  error: string;
  chipBackground: string;
  fillMuted: string;
  accentGlow: string;
  surfaceRaised: string;
  overlayBackdrop: string;
  onGradientPill: string;
  onGradientPillStrong: string;
  mediaLetterbox: string;
  shadowBase: string;
  xpGold: string;
  level: string;
};

export const lightColors: AppColors = {
  primary: '#FF6B35',
  primaryHover: '#EA580C',
  primaryLight: '#FFF7ED',
  primaryPale: '#FFEDD5',
  accent: '#8B5CF6',
  accentLight: '#EDE9FE',
  success: '#4CAF50',
  successLight: '#D1FAE5',
  danger: '#F44336',
  warning: '#F59E0B',
  background: '#FFFFFF',
  surface: '#F5F5F5',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#F5F5F5',
  text: '#0A0A0A',
  textSecondary: '#6B6B6B',
  textTertiary: '#9B9B9B',
  onPrimary: '#FFFFFF',
  onAccent: '#FFFFFF',
  border: '#E5E5E5',
  borderLight: '#F5F5F5',
  hairline: '#E5E5E5',
  xpGradientStart: '#FF6B35',
  xpGradientEnd: '#8B5CF6',
  link: '#FF6B35',
  error: '#F44336',
  chipBackground: 'rgba(0,0,0,0.04)',
  fillMuted: '#F5F5F5',
  accentGlow: 'rgba(255,107,53,0.15)',
  surfaceRaised: '#FFFFFF',
  overlayBackdrop: 'rgba(0,0,0,0.55)',
  onGradientPill: 'rgba(255,255,255,0.15)',
  onGradientPillStrong: 'rgba(255,255,255,0.2)',
  mediaLetterbox: '#000000',
  shadowBase: '#000000',
  xpGold: '#FFD700',
  level: '#8B5CF6',
};

export const darkColors: AppColors = {
  primary: '#FF6B35',
  primaryHover: '#EA580C',
  primaryLight: 'rgba(255,107,53,0.12)',
  primaryPale: 'rgba(255,107,53,0.08)',
  accent: '#A78BFA',
  accentLight: 'rgba(167,139,250,0.12)',
  success: '#34D399',
  successLight: 'rgba(52,211,153,0.12)',
  danger: '#F44336',
  warning: '#F59E0B',
  background: '#0A0A0A',
  surface: '#141414',
  surfaceElevated: '#1E1E1E',
  surfaceMuted: '#27272A',
  text: '#FFFFFF',
  textSecondary: '#9B9B9B',
  textTertiary: '#5A5A5A',
  onPrimary: '#FFFFFF',
  onAccent: '#FFFFFF',
  border: '#2A2A2A',
  borderLight: '#1F1F23',
  hairline: '#2A2A2A',
  xpGradientStart: '#FF6B35',
  xpGradientEnd: '#A78BFA',
  link: '#FF6B35',
  error: '#F44336',
  chipBackground: 'rgba(255,255,255,0.06)',
  fillMuted: '#27272A',
  accentGlow: 'rgba(255,107,53,0.22)',
  surfaceRaised: '#1E1E1E',
  overlayBackdrop: 'rgba(0,0,0,0.6)',
  onGradientPill: 'rgba(255,255,255,0.15)',
  onGradientPillStrong: 'rgba(255,255,255,0.2)',
  mediaLetterbox: '#000000',
  shadowBase: '#000000',
  xpGold: '#FFD700',
  level: '#8B5CF6',
};

export type ThemeName = 'light' | 'dark';

export type AccentThemeKey =
  | 'doji_orange'
  | 'neon_blue'
  | 'forest'
  | 'orchid'
  | 'cherry'
  | 'ocean'
  | 'sunset'
  | 'diamond';

export const ACCENT_THEME_CATALOG: Record<
  AccentThemeKey,
  { key: AccentThemeKey; name: string; color: string; /** Omitted for the built-in default (not sold in shop). */ price?: number }
> = {
  doji_orange: { key: 'doji_orange', name: 'Doji Orange', color: '#FF6B35' },
  neon_blue: { key: 'neon_blue', name: 'Neon Blue', color: '#2196F3', price: 160 },
  forest: { key: 'forest', name: 'Forest', color: '#4CAF50', price: 260 },
  orchid: { key: 'orchid', name: 'Orchid', color: '#9C27B0', price: 320 },
  cherry: { key: 'cherry', name: 'Cherry', color: '#F44336', price: 420 },
  ocean: { key: 'ocean', name: 'Ocean', color: '#00BCD4', price: 420 },
  sunset: { key: 'sunset', name: 'Sunset', color: '#FF9800', price: 520 },
  diamond: { key: 'diamond', name: 'Diamond', color: '#00D4FF', price: 680 },
};

export const DEFAULT_ACCENT_THEME: AccentThemeKey = 'doji_orange';

/** Shop-only accent themes (excludes the built-in default). */
export function isShopAccentTheme(key: AccentThemeKey): boolean {
  return key !== DEFAULT_ACCENT_THEME;
}

export function listShopAccentThemes() {
  return Object.values(ACCENT_THEME_CATALOG).filter((t) => isShopAccentTheme(t.key));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function darkenHex(hex: string, factor: number): string {
  const { r, g, b } = hexToRgb(hex);
  const d = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `#${d(r).toString(16).padStart(2, '0')}${d(g).toString(16).padStart(2, '0')}${d(b).toString(16).padStart(2, '0')}`;
}

function lightenHex(hex: string, mix: number): string {
  const { r, g, b } = hexToRgb(hex);
  const blend = (v: number) => Math.round(v + (255 - v) * mix);
  return `#${blend(r).toString(16).padStart(2, '0')}${blend(g).toString(16).padStart(2, '0')}${blend(b).toString(16).padStart(2, '0')}`;
}

/** Apply shop accent color onto light or dark base palette. */
export function buildThemedColors(mode: ThemeName, accentHex: string): AppColors {
  const base = mode === 'light' ? lightColors : darkColors;
  const primaryHover = darkenHex(accentHex, 0.88);
  const primaryLight = mode === 'light' ? lightenHex(accentHex, 0.92) : `${accentHex}22`;
  const primaryPale = mode === 'light' ? lightenHex(accentHex, 0.85) : `${accentHex}18`;
  const accentGlow =
    mode === 'light'
      ? `rgba(${hexToRgb(accentHex).r},${hexToRgb(accentHex).g},${hexToRgb(accentHex).b},0.15)`
      : `rgba(${hexToRgb(accentHex).r},${hexToRgb(accentHex).g},${hexToRgb(accentHex).b},0.22)`;

  return {
    ...base,
    primary: accentHex,
    primaryHover,
    primaryLight,
    primaryPale,
    xpGradientStart: accentHex,
    xpGradientEnd: base.accent,
    link: accentHex,
    accentGlow,
  };
}

export function normalizeAccentTheme(raw: unknown): AccentThemeKey {
  if (typeof raw === 'string' && raw in ACCENT_THEME_CATALOG) {
    return raw as AccentThemeKey;
  }
  return DEFAULT_ACCENT_THEME;
}

/** Built-in accent — always available without owning the shop item. */
export function isDefaultAccentTheme(key: string): boolean {
  return key === DEFAULT_ACCENT_THEME;
}

/** Use profile accent only when owned; otherwise fall back to the built-in default. */
export function resolveAccentTheme(
  profileAccent: string | undefined | null,
  ownedThemeKeys: Iterable<string>,
): AccentThemeKey {
  const accent = normalizeAccentTheme(profileAccent);
  if (isDefaultAccentTheme(accent)) return DEFAULT_ACCENT_THEME;
  const owned = new Set(ownedThemeKeys);
  return owned.has(accent) ? accent : DEFAULT_ACCENT_THEME;
}

export function isAccentThemeKey(key: string): key is AccentThemeKey {
  return key in ACCENT_THEME_CATALOG;
}

/** Used for new installs and before the user picks a theme in Settings. */
export const DEFAULT_APP_THEME: ThemeName = 'dark';

export const themeMap: Record<ThemeName, AppColors> = {
  light: lightColors,
  dark: darkColors,
};

const LEGACY_DARK_THEMES = new Set(['midnight', 'aurora', 'dark']);
const LEGACY_LIGHT_THEMES = new Set(['coral', 'ocean', 'forest', 'blossom', 'light']);

/** Coerce stored profile value to light or dark. Maps legacy 6-theme names on load. */
export function normalizeAppTheme(raw: unknown): ThemeName {
  if (raw === 'light' || raw === 'dark') return raw;
  if (typeof raw === 'string') {
    if (LEGACY_DARK_THEMES.has(raw)) return 'dark';
    if (LEGACY_LIGHT_THEMES.has(raw)) return 'light';
  }
  return DEFAULT_APP_THEME;
}

export function isDarkTheme(name: ThemeName): boolean {
  return name === 'dark';
}

/** Default avatar gradient when the DB has no custom pair. */
export const FALLBACK_AVATAR_GRADIENT: readonly [string, string] = [
  themeMap[DEFAULT_APP_THEME].xpGradientStart,
  themeMap[DEFAULT_APP_THEME].xpGradientEnd,
];

export type BadgeTierName = 'bronze' | 'silver' | 'gold' | 'diamond';

export const BADGE_TIER_COLORS: Record<BadgeTierName, string> = {
  bronze: '#E8944A',
  /** Medium neutral silver — darker gray, no blue cast. */
  silver: '#A0A0A6',
  gold: '#FFCA28',
  diamond: '#22D3EE',
};

// Legacy aliases
export const coralColors = lightColors;
export const oceanColors = lightColors;
export const forestColors = lightColors;
export const blossomColors = lightColors;
export const midnightColors = darkColors;
export const auroraColors = darkColors;
export const darkColorsAlias = darkColors;
export const Colors = darkColors;
export const lightColorsAlias = lightColors;

// ---------------------------------------------------------------------------
// XP Level thresholds
// ---------------------------------------------------------------------------
export const XP_LEVELS: number[] = [0, 500, 1200, 2000, 3000, 4500, 6500, 9000, 12000, 16000];

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level > XP_LEVELS.length) return XP_LEVELS[XP_LEVELS.length - 1];
  return XP_LEVELS[level - 1];
}

export function xpToNextLevel(
  currentXp: number,
  currentLevel: number,
): { current: number; max: number } {
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
  format: 35,
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

export function getCategoryColors(colors: AppColors): Record<string, string> {
  return {
    physical: colors.primary,
    creative: colors.accent,
    social: colors.link,
    mental: colors.success,
    wild: colors.warning,
  };
}
