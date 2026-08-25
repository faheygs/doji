-- Shop commands are safe to retry after a lost response. The owned-item row is
-- the durable command result: an already-owned item returns the current balance
-- instead of surfacing a false failure or spending Sparks twice.

create or replace function public.purchase_shop_item(p_item_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  item public.shop_items%rowtype;
  balance integer;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select * into item
  from public.shop_items catalog
  where catalog.key = p_item_key and catalog.is_active = true;
  if not found then raise exception 'item_not_found'; end if;
  if item.price < 1 then raise exception 'item_not_for_sale'; end if;

  -- Serialize every purchase/equip attempt for this user. This makes the
  -- ownership check and debit a single deterministic transaction even when
  -- multiple devices issue the same command concurrently.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(uid::text || ':shop', 0)
  );

  if exists (
    select 1 from public.user_shop_items owned
    where owned.user_id = uid and owned.item_key = p_item_key
  ) then
    select profile.sparks into balance from public.profiles profile where profile.id = uid;
    return jsonb_build_object(
      'item_key', p_item_key,
      'sparks', balance,
      'already_owned', true
    );
  end if;

  balance := public.spend_sparks(uid, item.price, 'purchase', p_item_key);
  insert into public.user_shop_items (user_id, item_key) values (uid, p_item_key);

  if item.kind = 'theme' then
    update public.profiles set accent_theme = p_item_key where id = uid;
  elsif item.kind = 'border' then
    update public.profiles set equipped_border_key = p_item_key where id = uid;
  elsif item.kind = 'title' then
    update public.profiles set equipped_title_key = p_item_key where id = uid;
  end if;

  return jsonb_build_object(
    'item_key', p_item_key,
    'sparks', balance,
    'already_owned', false
  );
end;
$$;

create or replace function public.equip_shop_item(p_item_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  item public.shop_items%rowtype;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select * into item
  from public.shop_items catalog
  where catalog.key = p_item_key and catalog.is_active = true;
  if not found then raise exception 'item_not_found'; end if;

  if not exists (
    select 1 from public.user_shop_items owned
    where owned.user_id = uid and owned.item_key = p_item_key
  ) then
    raise exception 'not_owned';
  end if;

  if item.kind = 'theme' then
    update public.profiles set accent_theme = p_item_key where id = uid;
  elsif item.kind = 'border' then
    update public.profiles set equipped_border_key = p_item_key where id = uid;
  elsif item.kind = 'title' then
    update public.profiles set equipped_title_key = p_item_key where id = uid;
  else
    raise exception 'not_equippable';
  end if;

  return jsonb_build_object('item_key', p_item_key);
end;
$$;

revoke all on function public.purchase_shop_item(text) from public, anon;
revoke all on function public.equip_shop_item(text) from public, anon;
grant execute on function public.purchase_shop_item(text) to authenticated;
grant execute on function public.equip_shop_item(text) to authenticated;

comment on function public.purchase_shop_item(text) is
  'Atomic retry-safe shop purchase. Existing ownership returns the durable result without another debit.';
