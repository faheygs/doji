-- Add is_demo flag to isolate seed posts from real feed
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;

-- Update ensure_demo_user_events to also seed sample posts for the demo screen
CREATE OR REPLACE FUNCTION ensure_demo_user_events(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Reset all demo user_events to pending (idempotent)
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

  -- Seed photo post (linked via daily_event_id, no user_event_id to avoid insert conflicts)
  INSERT INTO posts (
    user_id, daily_event_id, type, photo_url, caption,
    visibility, is_late, is_demo, comments_disabled
  )
  SELECT
    p_user_id,
    '11111111-1111-1111-1111-111111111111',
    'photo',
    'https://picsum.photos/seed/doji-demo-photo/600/600',
    'My morning setup — finally got the lighting right 📸',
    'friends', false, true, false
  WHERE NOT EXISTS (
    SELECT 1 FROM posts
    WHERE user_id = p_user_id
      AND daily_event_id = '11111111-1111-1111-1111-111111111111'
      AND is_demo = true
  );

  -- Seed poll_vote post
  INSERT INTO posts (
    user_id, daily_event_id, type, caption, selected_option_index,
    visibility, is_late, is_demo, comments_disabled
  )
  SELECT
    p_user_id,
    '22222222-2222-2222-2222-222222222222',
    'poll_vote',
    NULL, 1,
    'friends', false, true, false
  WHERE NOT EXISTS (
    SELECT 1 FROM posts
    WHERE user_id = p_user_id
      AND daily_event_id = '22222222-2222-2222-2222-222222222222'
      AND is_demo = true
  );

  -- Seed task post
  INSERT INTO posts (
    user_id, daily_event_id, type, caption,
    visibility, is_late, is_demo, comments_disabled
  )
  SELECT
    p_user_id,
    '33333333-3333-3333-3333-333333333333',
    'task_complete',
    'Productive chaos. Three meetings, one good idea, two cold coffees. Somehow still smiling.',
    'friends', false, true, false
  WHERE NOT EXISTS (
    SELECT 1 FROM posts
    WHERE user_id = p_user_id
      AND daily_event_id = '33333333-3333-3333-3333-333333333333'
      AND is_demo = true
  );

  -- Seed format post
  INSERT INTO posts (
    user_id, daily_event_id, type, caption,
    visibility, is_late, is_demo, comments_disabled
  )
  SELECT
    p_user_id,
    '44444444-4444-4444-4444-444444444444',
    'task_complete',
    'She checked her phone one last time before bed. The notification could wait — it already had for three years.',
    'friends', false, true, false
  WHERE NOT EXISTS (
    SELECT 1 FROM posts
    WHERE user_id = p_user_id
      AND daily_event_id = '44444444-4444-4444-4444-444444444444'
      AND is_demo = true
  );

  -- Set poll options to realistic vote counts (only when still at 0)
  UPDATE poll_options SET vote_count = 47
    WHERE challenge_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND position = 0 AND vote_count = 0;
  UPDATE poll_options SET vote_count = 28
    WHERE challenge_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND position = 1 AND vote_count = 0;
  UPDATE poll_options SET vote_count = 8
    WHERE challenge_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND position = 2 AND vote_count = 0;
  UPDATE poll_options SET vote_count = 17
    WHERE challenge_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND position = 3 AND vote_count = 0;

END;
$$;
