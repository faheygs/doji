-- Doji Orange is the built-in default accent — not sold in the shop.

UPDATE public.shop_items
SET is_active = false
WHERE key = 'doji_orange';

DELETE FROM public.user_shop_items
WHERE item_key = 'doji_orange';

-- Re-sort remaining shop themes (net-new only)
UPDATE public.shop_items SET sort_order = 1 WHERE key = 'neon_blue';
UPDATE public.shop_items SET sort_order = 2 WHERE key = 'forest';
UPDATE public.shop_items SET sort_order = 3 WHERE key = 'orchid';
UPDATE public.shop_items SET sort_order = 4 WHERE key = 'cherry';
UPDATE public.shop_items SET sort_order = 5 WHERE key = 'ocean';
UPDATE public.shop_items SET sort_order = 6 WHERE key = 'sunset';
UPDATE public.shop_items SET sort_order = 7 WHERE key = 'diamond';

COMMENT ON COLUMN public.profiles.accent_theme IS 'Accent theme key; doji_orange is the free default, others require shop purchase.';
