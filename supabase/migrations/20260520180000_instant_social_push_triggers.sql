-- Instant social push: DB triggers → pg_net → notify-user Edge Function (Expo).
-- Requires Vault secrets from 20260516143000_pg_cron_doji_automation.sql:
--   doji_project_url, doji_cron_secret (same as CRON_SECRET on Edge Functions).

CREATE OR REPLACE FUNCTION public.doji_notify_user_push(
  p_target_user_id uuid,
  p_title text,
  p_body text,
  p_data jsonb,
  p_preference_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_secret text;
  v_payload jsonb;
BEGIN
  SELECT decrypted_secret::text INTO v_url FROM vault.decrypted_secrets WHERE name = 'doji_project_url' LIMIT 1;
  SELECT decrypted_secret::text INTO v_secret FROM vault.decrypted_secrets WHERE name = 'doji_cron_secret' LIMIT 1;
  IF v_url IS NULL OR v_secret IS NULL OR btrim(v_url) = '' OR btrim(v_secret) = '' THEN
    RAISE WARNING 'doji_notify_user_push: vault secrets doji_project_url / doji_cron_secret missing';
    RETURN;
  END IF;

  v_payload := jsonb_build_object(
    'target_user_id', p_target_user_id::text,
    'title', p_title,
    'body', p_body,
    'data', COALESCE(p_data, '{}'::jsonb),
    'preference_key', p_preference_key
  );

  PERFORM net.http_post(
    url := rtrim(btrim(v_url), '/') || '/functions/v1/notify-user',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || btrim(v_secret)
    ),
    body := v_payload
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Reactions: notify post owner (skip community cards and self-reactions)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_reaction_push_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_community boolean;
  v_reactor text;
BEGIN
  SELECT p.user_id, COALESCE(p.is_community_poll, false)
  INTO v_owner, v_community
  FROM public.posts p
  WHERE p.id = NEW.post_id;

  IF v_community OR v_owner IS NULL OR v_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO v_reactor FROM public.profiles WHERE id = NEW.user_id LIMIT 1;

  PERFORM public.doji_notify_user_push(
    v_owner,
    'New reaction',
    COALESCE(v_reactor, 'Someone') || ' reacted to your post',
    jsonb_build_object('type', 'REACTION', 'postId', NEW.post_id::text),
    'reactions_on_my_post'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reactions_push_notify ON public.reactions;
CREATE TRIGGER reactions_push_notify
  AFTER INSERT ON public.reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_reaction_push_notify();

-- ---------------------------------------------------------------------------
-- Friend request (pending insert)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_friendship_request_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO v_name FROM public.profiles WHERE id = NEW.requester_id LIMIT 1;

  PERFORM public.doji_notify_user_push(
    NEW.addressee_id,
    'Friend request',
    COALESCE(v_name, 'Someone') || ' sent you a friend request',
    jsonb_build_object('type', 'FRIEND_REQUEST', 'friendshipId', NEW.id::text),
    'friend_request'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friendships_request_push ON public.friendships;
CREATE TRIGGER friendships_request_push
  AFTER INSERT ON public.friendships
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_friendship_request_push();

-- ---------------------------------------------------------------------------
-- Friend accepted (pending → accepted)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_friendship_accepted_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    SELECT display_name INTO v_name FROM public.profiles WHERE id = NEW.addressee_id LIMIT 1;
    PERFORM public.doji_notify_user_push(
      NEW.requester_id,
      'Friends',
      COALESCE(v_name, 'Someone') || ' accepted your friend request',
      jsonb_build_object('type', 'FRIEND_ACCEPTED', 'friendshipId', NEW.id::text),
      'friend_accepted'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friendships_accepted_push ON public.friendships;
CREATE TRIGGER friendships_accepted_push
  AFTER UPDATE ON public.friendships
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_friendship_accepted_push();

-- ---------------------------------------------------------------------------
-- Badges
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_user_badge_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_badge_name text;
  v_emoji text;
  v_body text;
BEGIN
  SELECT b.name, b.emoji INTO v_badge_name, v_emoji
  FROM public.badges b
  WHERE b.id = NEW.badge_id
  LIMIT 1;

  v_body := trim(both ' ' from concat_ws(' ', nullif(trim(COALESCE(v_emoji, '')), ''), COALESCE(v_badge_name, 'New badge')));

  PERFORM public.doji_notify_user_push(
    NEW.user_id,
    'Badge unlocked',
    v_body,
    jsonb_build_object('type', 'BADGE', 'badgeId', NEW.badge_id),
    'badges'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_badges_push ON public.user_badges;
CREATE TRIGGER user_badges_push
  AFTER INSERT ON public.user_badges
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_user_badge_push();

-- ---------------------------------------------------------------------------
-- Friend posts: notify each accepted friend (respect friend_post preference in Edge)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_post_friend_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  r RECORD;
BEGIN
  IF COALESCE(NEW.is_community_poll, false) OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO v_name FROM public.profiles WHERE id = NEW.user_id LIMIT 1;

  FOR r IN
    SELECT CASE WHEN f.requester_id = NEW.user_id THEN f.addressee_id ELSE f.requester_id END AS fid
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (f.requester_id = NEW.user_id OR f.addressee_id = NEW.user_id)
  LOOP
    PERFORM public.doji_notify_user_push(
      r.fid,
      'Friend activity',
      COALESCE(v_name, 'Your friend') || ' shared a new post',
      jsonb_build_object('type', 'FRIEND_POST', 'postId', NEW.id::text),
      'friend_post'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_friend_push ON public.posts;
CREATE TRIGGER posts_friend_push
  AFTER INSERT ON public.posts
  FOR EACH ROW
  WHEN (COALESCE(NEW.is_community_poll, false) = false AND NEW.user_id IS NOT NULL)
  EXECUTE FUNCTION public.trg_post_friend_push();
