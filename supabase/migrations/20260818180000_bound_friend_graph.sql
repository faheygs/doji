-- Doji is a private-circle product. A hard accepted-friend bound prevents one
-- post from producing an unbounded transactional fanout and keeps friend reads,
-- realtime membership hints, and notification grouping predictable at scale.
create or replace function public.assert_friend_capacity(
  p_first_user_id uuid,
  p_second_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_count integer;
  second_count integer;
begin
  select count(*)::integer into first_count
  from public.friendships friendship
  where friendship.status = 'accepted'
    and (friendship.requester_id = p_first_user_id
      or friendship.addressee_id = p_first_user_id);

  select count(*)::integer into second_count
  from public.friendships friendship
  where friendship.status = 'accepted'
    and (friendship.requester_id = p_second_user_id
      or friendship.addressee_id = p_second_user_id);

  if first_count >= 500 or second_count >= 500 then
    raise exception 'Friend limit reached';
  end if;
end;
$$;

revoke all on function public.assert_friend_capacity(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.request_friendship(
  p_addressee_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  friendship_row public.friendships%rowtype;
  prior_result jsonb;
  final_result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_addressee_id = uid then raise exception 'Cannot add yourself'; end if;
  if length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(least(uid::text, p_addressee_id::text) || ':' ||
      greatest(uid::text, p_addressee_id::text), 0)
  );
  select receipt.result into prior_result
  from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  select * into friendship_row
  from public.friendships
  where (requester_id = uid and addressee_id = p_addressee_id)
     or (requester_id = p_addressee_id and addressee_id = uid)
  order by created_at desc
  limit 1
  for update;

  if found then
    if friendship_row.status = 'pending'
       and friendship_row.requester_id = p_addressee_id then
      perform pg_advisory_xact_lock(hashtextextended(
        least(uid::text, p_addressee_id::text) || ':friend-cap', 0));
      perform pg_advisory_xact_lock(hashtextextended(
        greatest(uid::text, p_addressee_id::text) || ':friend-cap', 0));
      perform public.assert_friend_capacity(uid, p_addressee_id);
      update public.friendships
      set status = 'accepted', accepted_at = clock_timestamp()
      where id = friendship_row.id
      returning * into friendship_row;
    elsif friendship_row.status = 'blocked' then
      raise exception 'Friend request unavailable';
    end if;
  else
    if exists (
      select 1 from public.blocks
      where (blocker_id = uid and blocked_id = p_addressee_id)
         or (blocker_id = p_addressee_id and blocked_id = uid)
    ) then
      raise exception 'Friend request unavailable';
    end if;
    if (
      select count(*)
      from public.friendships friendship
      where friendship.requester_id = uid and friendship.status = 'pending'
    ) >= 100 then
      raise exception 'Too many pending friend requests';
    end if;
    insert into public.friendships (requester_id, addressee_id, status)
    values (uid, p_addressee_id, 'pending')
    returning * into friendship_row;
  end if;

  final_result := to_jsonb(friendship_row);
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.request_friendship(uuid, text) from public, anon;
grant execute on function public.request_friendship(uuid, text) to authenticated;

create or replace function public.respond_to_friendship(
  p_friendship_id uuid,
  p_accept boolean,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  friendship_row public.friendships%rowtype;
  other_user_id uuid;
  prior_result jsonb;
  final_result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_friendship_id::text, 0));

  select receipt.result into prior_result
  from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  select * into friendship_row
  from public.friendships
  where id = p_friendship_id and addressee_id = uid
  for update;
  if not found then raise exception 'Friend request not found'; end if;
  if friendship_row.status <> 'pending' then raise exception 'Friend request is no longer pending'; end if;

  if p_accept then
    other_user_id := friendship_row.requester_id;
    perform pg_advisory_xact_lock(hashtextextended(
      least(uid::text, other_user_id::text) || ':friend-cap', 0));
    perform pg_advisory_xact_lock(hashtextextended(
      greatest(uid::text, other_user_id::text) || ':friend-cap', 0));
    perform public.assert_friend_capacity(uid, other_user_id);
    update public.friendships
    set status = 'accepted', accepted_at = clock_timestamp()
    where id = p_friendship_id
    returning * into friendship_row;
    final_result := to_jsonb(friendship_row);
  else
    delete from public.friendships where id = p_friendship_id;
    final_result := jsonb_build_object('id', p_friendship_id, 'status', 'declined');
  end if;

  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.respond_to_friendship(uuid, boolean, text) from public, anon;
grant execute on function public.respond_to_friendship(uuid, boolean, text) to authenticated;

comment on function public.assert_friend_capacity(uuid, uuid) is
  'Enforces the 500-member private-circle bound under per-user advisory locks.';

-- Blocking is a private safety choice. Only an explicit content/user report
-- enters moderation or emails the administrator.
drop trigger if exists trg_block_notify_admin on public.blocks;
drop function if exists public.trg_block_notify_admin();

-- The consolidated comment trigger already emits the recipient-aware reply
-- event through the transactional outbox. This legacy pg_net trigger otherwise
-- sends a second, non-idempotent notification for the same reply.
drop trigger if exists comments_reply_push on public.comments;
drop function if exists public.trg_comment_reply_push();
