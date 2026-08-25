-- Every equip request has a durable result. A gateway retry returns that result
-- without replaying an older cosmetic choice over a newer one.

drop function if exists public.equip_shop_item(text);

create or replace function public.equip_shop_item(
  p_item_key text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  item public.shop_items%rowtype;
  saved jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if length(p_idempotency_key) < 16 then raise exception 'invalid_idempotency_key'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(uid::text || ':' || p_idempotency_key, 0)
  );
  select receipt.result into saved
  from public.command_receipts receipt
  where receipt.user_id = uid
    and receipt.idempotency_key = p_idempotency_key;
  if found then return saved; end if;

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

  saved := jsonb_build_object('item_key', p_item_key);
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, saved);
  return saved;
end;
$$;

revoke all on function public.equip_shop_item(text, text) from public, anon;
grant execute on function public.equip_shop_item(text, text) to authenticated;

comment on function public.equip_shop_item(text, text) is
  'Atomic idempotent cosmetic equip. A retry returns its receipt and cannot replay stale state.';
