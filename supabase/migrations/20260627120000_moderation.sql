-- Moderation: blocks, reports, banned accounts, content RLS
-- Addresses Apple App Store guideline 1.2 (User-Generated Content)

-- ─── blocks ───────────────────────────────────────────────────────────────────
create table public.blocks (
  id         uuid primary key default gen_random_uuid(),
  blocker_id uuid not null,
  blocked_id uuid not null,
  created_at timestamptz not null default now(),
  constraint blocks_no_self_block check (blocker_id <> blocked_id),
  constraint blocks_unique         unique (blocker_id, blocked_id),
  constraint blocks_blocker_fkey   foreign key (blocker_id) references public.profiles(id) on delete cascade,
  constraint blocks_blocked_fkey   foreign key (blocked_id) references public.profiles(id) on delete cascade
);

alter table public.blocks enable row level security;

create policy "blocks_owner_all" on public.blocks
  for all
  using  (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());

-- ─── reports ──────────────────────────────────────────────────────────────────
create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null,
  reported_user_id uuid,
  post_id          uuid,
  comment_id       uuid,
  reason           text not null check (reason in ('spam', 'inappropriate', 'harassment', 'other')),
  status           text not null default 'pending' check (status in ('pending', 'dismissed', 'actioned')),
  notes            text,
  created_at       timestamptz not null default now(),
  constraint reports_reporter_fkey      foreign key (reporter_id)      references public.profiles(id) on delete cascade,
  constraint reports_reported_fkey      foreign key (reported_user_id) references public.profiles(id) on delete set null,
  constraint reports_post_fkey          foreign key (post_id)          references public.posts(id)    on delete set null,
  constraint reports_comment_fkey       foreign key (comment_id)       references public.comments(id) on delete set null
);

alter table public.reports enable row level security;

-- Any authenticated user can submit a report
create policy "reports_insert_own" on public.reports
  for insert with check (reporter_id = auth.uid());

-- Only admins can read reports
create policy "reports_admin_select" on public.reports
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- Only admins can update report status
create policy "reports_admin_update" on public.reports
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- ─── is_banned on profiles ────────────────────────────────────────────────────
alter table public.profiles add column if not exists is_banned boolean not null default false;

-- Admins can update any profile (for banning)
create policy "profiles_admin_update" on public.profiles
  for update
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (true);

-- ─── Admin: delete any post (for content removal) ─────────────────────────────
create policy "posts_admin_delete" on public.posts
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- ─── Restrictive RLS: hide posts from blocked / blocking users ─────────────────
-- 'restrictive' combines with AND — must pass even when a permissive policy matches.
create policy "posts_hide_blocks" on public.posts
  as restrictive
  for select using (
    not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = posts.user_id)
         or (b.blocker_id = posts.user_id and b.blocked_id = auth.uid())
    )
  );

-- ─── Restrictive RLS: hide comments from blocked / blocking users ──────────────
create policy "comments_hide_blocks" on public.comments
  as restrictive
  for select using (
    not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = comments.user_id)
         or (b.blocker_id = comments.user_id and b.blocked_id = auth.uid())
    )
  );

-- ─── pg_net helper: email admin via send-admin-email edge function ─────────────
create or replace function public.doji_notify_admin_email(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret::text into v_url    from vault.decrypted_secrets where name = 'doji_project_url'  limit 1;
  select decrypted_secret::text into v_secret from vault.decrypted_secrets where name = 'doji_cron_secret'  limit 1;

  if v_url is null or v_secret is null or btrim(v_url) = '' or btrim(v_secret) = '' then
    raise warning 'doji_notify_admin_email: vault secrets doji_project_url / doji_cron_secret missing';
    return;
  end if;

  perform net.http_post(
    url     := rtrim(btrim(v_url), '/') || '/functions/v1/send-admin-email',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || btrim(v_secret)
    ),
    body := p_payload
  );
end;
$$;

-- Trigger: notify admin when a report is filed
create or replace function public.trg_report_notify_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.doji_notify_admin_email(jsonb_build_object(
    'event',            'report',
    'report_id',        new.id,
    'reporter_id',      new.reporter_id,
    'reported_user_id', new.reported_user_id,
    'post_id',          new.post_id,
    'reason',           new.reason
  ));
  return new;
end;
$$;

create trigger trg_report_notify_admin
  after insert on public.reports
  for each row execute function public.trg_report_notify_admin();

-- Trigger: notify admin when a block is created
create or replace function public.trg_block_notify_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.doji_notify_admin_email(jsonb_build_object(
    'event',      'block',
    'blocker_id', new.blocker_id,
    'blocked_id', new.blocked_id
  ));
  return new;
end;
$$;

create trigger trg_block_notify_admin
  after insert on public.blocks
  for each row execute function public.trg_block_notify_admin();
