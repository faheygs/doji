-- Per-user notification category toggles + master switch (push_enabled).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{
    "push_enabled": true,
    "doji_start": true,
    "friend_post": true,
    "reactions_on_my_post": true,
    "friend_request": true,
    "friend_accepted": true,
    "badges": true
  }'::jsonb;

COMMENT ON COLUMN public.profiles.notification_preferences IS
  'Push/local notification preferences: push_enabled master + category flags (doji_start, friend_post, etc.).';
