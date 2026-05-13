-- Per-user UI theme (client: coral | ocean | midnight | forest).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS app_theme text NOT NULL DEFAULT 'midnight';

COMMENT ON COLUMN public.profiles.app_theme IS
  'Color theme key for the mobile app; matches client ThemeName.';
