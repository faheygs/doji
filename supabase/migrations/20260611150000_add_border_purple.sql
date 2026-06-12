INSERT INTO public.shop_items (key, kind, name, price, sort_order, metadata)
VALUES ('border_purple', 'border', 'Purple', 400, 14, '{"color":"#A855F7","width":3}')
ON CONFLICT (key) DO NOTHING;
