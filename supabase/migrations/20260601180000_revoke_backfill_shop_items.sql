-- Remove backfilled free shop grants (no purchase ledger entry) and clear invalid equipped keys.

DELETE FROM public.user_shop_items u
WHERE NOT EXISTS (
  SELECT 1
  FROM public.spark_ledger sl
  WHERE sl.user_id = u.user_id
    AND sl.reason = 'purchase'
    AND sl.ref_id = u.item_key
);

UPDATE public.profiles p
SET equipped_border_key = NULL
WHERE equipped_border_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_shop_items u
    WHERE u.user_id = p.id AND u.item_key = p.equipped_border_key
  );

UPDATE public.profiles p
SET equipped_title_key = NULL
WHERE equipped_title_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_shop_items u
    WHERE u.user_id = p.id AND u.item_key = p.equipped_title_key
  );
