-- Fix: drop the OLD reaction_count trigger from 001/007 that duplicates
-- the redesign's reaction_insert_trigger / reaction_delete_trigger.
-- Both were incrementing/decrementing posts.reaction_count on each reaction.

DROP TRIGGER IF EXISTS reactions_count_trigger ON public.reactions;

-- Make the redesign triggers SECURITY DEFINER so they can update posts
-- owned by other users (same reason 007 added it to the old function).
CREATE OR REPLACE FUNCTION public.trg_reaction_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_post_owner uuid;
BEGIN
  UPDATE public.posts SET reaction_count = reaction_count + 1 WHERE id = NEW.post_id;
  SELECT user_id INTO v_post_owner FROM public.posts WHERE id = NEW.post_id;
  IF v_post_owner IS NOT NULL THEN
    UPDATE public.profiles SET reactions_received = reactions_received + 1 WHERE id = v_post_owner;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_reaction_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_post_owner uuid;
BEGIN
  UPDATE public.posts SET reaction_count = GREATEST(0, reaction_count - 1) WHERE id = OLD.post_id;
  SELECT user_id INTO v_post_owner FROM public.posts WHERE id = OLD.post_id;
  IF v_post_owner IS NOT NULL THEN
    UPDATE public.profiles SET reactions_received = GREATEST(0, reactions_received - 1) WHERE id = v_post_owner;
  END IF;
  RETURN OLD;
END;
$$;
