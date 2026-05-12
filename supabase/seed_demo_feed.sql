-- Demo feed data: two accounts who are friends + a few posts.
-- Prerequisites: run main migrations + seed.sql (challenges).
--
-- Apply locally:
--   supabase db execute --file supabase/seed_demo_feed.sql
-- Or paste into Supabase Dashboard → SQL Editor (often works only on local / service-role contexts).
--
-- Sign-in (after seed):
--   feed_demo_alice@doji.local  / SeedDemo123!
--   feed_demo_bob@doji.local    / SeedDemo123!
--
-- To see these posts from YOUR normal account, insert an accepted friendship row between your
-- profiles.id and either demo UUID (see bottom).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  alice uuid := 'b1111111-1111-1111-1111-111111111111';
  bob uuid := 'b2222222-2222-2222-2222-222222222222';
  cid uuid;
  deid uuid;
  ue_alice uuid;
  ue_bob uuid;
  instance uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.challenges LIMIT 1) THEN
    RAISE EXCEPTION 'Seed challenges first (supabase/seed.sql)';
  END IF;

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data
  )
  VALUES (
    instance,
    alice,
    'authenticated',
    'authenticated',
    'feed_demo_alice@doji.local',
    crypt('SeedDemo123!', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data
  )
  VALUES (
    instance,
    bob,
    'authenticated',
    'authenticated',
    'feed_demo_bob@doji.local',
    crypt('SeedDemo123!', gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  SELECT
    gen_random_uuid(),
    alice,
    jsonb_build_object(
      'sub', alice::text,
      'email', 'feed_demo_alice@doji.local',
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    'feed_demo_alice@doji.local',
    now(),
    now(),
    now()
  WHERE NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = alice AND provider = 'email');

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  SELECT
    gen_random_uuid(),
    bob,
    jsonb_build_object(
      'sub', bob::text,
      'email', 'feed_demo_bob@doji.local',
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    'feed_demo_bob@doji.local',
    now(),
    now(),
    now()
  WHERE NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = bob AND provider = 'email');

  INSERT INTO public.profiles (id, username, display_name, timezone)
  VALUES (alice, 'feed_demo_alice', 'Demo Alice', 'Etc/UTC')
  ON CONFLICT (id) DO UPDATE SET
    username = excluded.username,
    display_name = excluded.display_name;

  INSERT INTO public.profiles (id, username, display_name, timezone)
  VALUES (bob, 'feed_demo_bob', 'Demo Bob', 'Etc/UTC')
  ON CONFLICT (id) DO UPDATE SET
    username = excluded.username,
    display_name = excluded.display_name;

  INSERT INTO public.friendships (requester_id, addressee_id, status)
  VALUES (alice, bob, 'accepted')
  ON CONFLICT (requester_id, addressee_id) DO NOTHING;

  SELECT c.id INTO cid FROM public.challenges c ORDER BY c.created_at ASC LIMIT 1;

  SELECT de.id INTO deid FROM public.daily_events de WHERE de.challenge_id = cid ORDER BY de.created_at DESC LIMIT 1;

  IF deid IS NULL THEN
    INSERT INTO public.daily_events (challenge_id, fires_at, window_minutes)
    VALUES (cid, now() + interval '1 hour', 720)
    RETURNING id INTO deid;
  END IF;

  INSERT INTO public.user_events (user_id, daily_event_id, status, completed_at, expires_at)
  VALUES (alice, deid, 'completed', now(), now() + interval '2 days')
  ON CONFLICT (user_id, daily_event_id) DO UPDATE SET
    status = excluded.status,
    completed_at = excluded.completed_at,
    expires_at = excluded.expires_at
  RETURNING id INTO ue_alice;

  INSERT INTO public.user_events (user_id, daily_event_id, status, completed_at, expires_at)
  VALUES (bob, deid, 'completed', now(), now() + interval '2 days')
  ON CONFLICT (user_id, daily_event_id) DO UPDATE SET
    status = excluded.status,
    completed_at = excluded.completed_at,
    expires_at = excluded.expires_at
  RETURNING id INTO ue_bob;

  IF NOT EXISTS (SELECT 1 FROM public.posts WHERE user_event_id = ue_alice) THEN
    INSERT INTO public.posts (
      user_event_id,
      user_id,
      caption,
      photo_url,
      is_late,
      visibility,
      created_at
    )
    VALUES (
      ue_alice,
      alice,
      'Morning streak — knocked out today''s challenge.',
      'https://picsum.photos/seed/doji-alice/800/800',
      false,
      'friends',
      timezone('utc', now()) - interval '26 hours'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.posts WHERE user_event_id = ue_bob) THEN
    INSERT INTO public.posts (
      user_event_id,
      user_id,
      caption,
      photo_url,
      is_late,
      visibility,
      created_at
    )
    VALUES (
      ue_bob,
      bob,
      'Bob checking in — friends-only proof.',
      'https://picsum.photos/seed/doji-bob/800/800',
      false,
      'friends',
      timezone('utc', now()) - interval '6 hours'
    );
  END IF;
END $$;

-- Optional: friend YOUR account with Alice so your feed shows demo posts without logging in as Alice.
-- Replace the first UUID with your profiles.id from Table Editor.
/*
INSERT INTO public.friendships (requester_id, addressee_id, status)
VALUES (
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid,
  'b1111111-1111-1111-1111-111111111111'::uuid,
  'accepted'
)
ON CONFLICT (requester_id, addressee_id) DO NOTHING;
*/
