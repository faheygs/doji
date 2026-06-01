-- Rebrand shop titles: personality flex, not achievement badges.

UPDATE public.shop_items
SET
  name = 'Chaos Agent',
  metadata = '{"label":"Chaos Agent","tagline":"Zero chill. Maximum plot."}'::jsonb
WHERE key = 'title_early_bird';

UPDATE public.shop_items
SET
  name = 'Main Character',
  metadata = '{"label":"Main Character","tagline":"The timeline bends around you."}'::jsonb
WHERE key = 'title_streak_master';

UPDATE public.shop_items
SET
  name = 'Certified Delulu',
  metadata = '{"label":"Certified Delulu","tagline":"Reality is a suggestion."}'::jsonb
WHERE key = 'title_doji_og';
