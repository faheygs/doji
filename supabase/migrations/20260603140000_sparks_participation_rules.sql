-- Spark participation rules:
-- • Reactions / comments: once per user per post (prior migrations)
-- • Posts (photo / question): once per post
-- • Poll votes: once per user per challenge (each poll participation)
-- • Suggestion approved: once per suggestion

ALTER TABLE public.spark_ledger DROP CONSTRAINT IF EXISTS spark_ledger_reason_check;
ALTER TABLE public.spark_ledger
  ADD CONSTRAINT spark_ledger_reason_check
  CHECK (reason IN (
    'challenge_complete', 'level_up', 'badge_unlock', 'buy_in', 'purchase', 'welcome_bonus',
    'comment', 'reaction', 'post', 'poll_vote', 'friend_request', 'friend_accept',
    'suggestion_approved'
  ));

CREATE OR REPLACE FUNCTION public.trg_sparks_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL
     AND COALESCE(NEW.is_community_poll, false) = false
     AND NEW.type IN ('photo', 'task_complete')
  THEN
    PERFORM public.award_sparks_once(NEW.user_id, 10, 'post', 'post:' || NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sparks_poll_vote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.award_sparks_once(
    NEW.user_id,
    5,
    'poll_vote',
    'poll_vote:challenge:' || NEW.challenge_id::text || ':' || NEW.user_id::text
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sparks_suggestion_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM 'approved'
     AND NEW.status = 'approved'
  THEN
    PERFORM public.award_sparks_once(
      NEW.user_id,
      15,
      'suggestion_approved',
      'suggestion:' || NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sparks_suggestion_approved ON public.challenge_suggestions;
CREATE TRIGGER sparks_suggestion_approved
  AFTER UPDATE OF status ON public.challenge_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sparks_suggestion_approved();
