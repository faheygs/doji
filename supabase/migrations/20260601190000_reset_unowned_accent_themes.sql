-- Reset accent to built-in default when the user no longer owns that shop theme.

UPDATE public.profiles p
SET accent_theme = 'doji_orange'
WHERE accent_theme IS DISTINCT FROM 'doji_orange'
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_shop_items u
    WHERE u.user_id = p.id
      AND u.item_key = p.accent_theme
  );
