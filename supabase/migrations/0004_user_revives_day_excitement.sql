-- Streak revive caps on users + journal excitement check-ins (matches AppState Person + dayExcitement).

alter table public.users
  add column if not exists streak_revives_remaining integer not null default 3
    check (streak_revives_remaining >= 0 and streak_revives_remaining <= 3);

alter table public.users
  add column if not exists streak_revives_next_refill_at timestamptz;

comment on column public.users.streak_revives_remaining is 'Partner streak revives remaining (cap 3)';
comment on column public.users.streak_revives_next_refill_at is 'Next +1 revive anchor (14-day cadence)';

update public.users
set streak_revives_next_refill_at = coalesce(
  streak_revives_next_refill_at,
  created_at + interval '14 days'
)
where streak_revives_next_refill_at is null;

create table if not exists public.day_excitement (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  stars smallint not null check (stars >= 1 and stars <= 5),
  note text not null default '',
  saved_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.day_excitement enable row level security;

create policy day_excitement_select_own on public.day_excitement
  for select using (user_id = public.current_user_id());

create policy day_excitement_insert_own on public.day_excitement
  for insert with check (user_id = public.current_user_id());

create policy day_excitement_update_own on public.day_excitement
  for update using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

create policy day_excitement_delete_own on public.day_excitement
  for delete using (user_id = public.current_user_id());

create index if not exists day_excitement_user_date_idx
  on public.day_excitement (user_id, date desc);
