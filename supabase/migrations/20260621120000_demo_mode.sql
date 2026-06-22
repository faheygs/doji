-- Add demo flags
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_demo_account boolean DEFAULT false;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;

-- Seed 4 demo challenges with STABLE UUIDs (all hex, valid format)
INSERT INTO challenges (
  id, title, description, type, emoji, category, difficulty,
  xp_reward, participant_count, requires_photo, requires_video, requires_text,
  answer_rule, is_active, is_demo, schedule_count, created_at
) VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Show Us Your World',
    'Share a photo of what you''re looking at right now.',
    'photo', '📸', 'wild', 2, 25, 0,
    true, false, false, NULL, false, true, 0, now()
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'Coffee or Tea?',
    'Which do you prefer to start your morning?',
    'poll', '☕', 'social', 1, 25, 0,
    false, false, false, NULL, false, true, 0, now()
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'Describe Your Day',
    'In one sentence, how would you describe today so far?',
    'task', '📝', 'mental', 1, 25, 0,
    false, false, true, NULL, false, true, 0, now()
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'Two Sentence Story',
    'Write a two-sentence story about your morning.',
    'format', '✍️', 'creative', 2, 25, 0,
    false, false, true,
    '{"type": "starts_with_letter", "letter": "T"}'::jsonb,
    false, true, 0, now()
  )
ON CONFLICT (id) DO NOTHING;

-- Seed poll options for demo poll challenge
INSERT INTO poll_options (challenge_id, text, position, vote_count) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Coffee ☕', 0, 0),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Tea 🍵', 1, 0),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Neither', 2, 0),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Both!', 3, 0)
ON CONFLICT DO NOTHING;

-- Seed 4 demo daily_events with STABLE UUIDs
INSERT INTO daily_events (id, challenge_id, fires_at, window_minutes, created_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2024-01-01 18:00:00+00', 999999, now()),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2024-01-01 18:00:00+00', 999999, now()),
  ('33333333-3333-3333-3333-333333333333', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '2024-01-01 18:00:00+00', 999999, now()),
  ('44444444-4444-4444-4444-444444444444', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '2024-01-01 18:00:00+00', 999999, now())
ON CONFLICT (id) DO NOTHING;

-- RPC: create/reset demo user_events for a user (called when entering demo mode)
CREATE OR REPLACE FUNCTION ensure_demo_user_events(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_events (user_id, daily_event_id, status, expires_at, signup_day_grace)
  SELECT
    p_user_id,
    de.id,
    'pending',
    '2099-01-01 00:00:00+00'::timestamptz,
    false
  FROM daily_events de
  JOIN challenges c ON c.id = de.challenge_id
  WHERE c.is_demo = true
  ON CONFLICT (user_id, daily_event_id) DO UPDATE
    SET status = 'pending',
        expires_at = '2099-01-01 00:00:00+00'::timestamptz,
        completed_at = NULL;
END;
$$;
