-- Completion mutation metadata + realtime event log for optimistic sync.

alter table if exists public.habit_completions
  add column if not exists operation_id text,
  add column if not exists actor_user_id uuid references public.users(id) on delete set null,
  add column if not exists device_id text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists version bigint not null default 1,
  add column if not exists deleted_at timestamptz;

create unique index if not exists habit_completions_operation_id_uidx
  on public.habit_completions (operation_id)
  where operation_id is not null;

create index if not exists habit_completions_couple_updated_idx
  on public.habit_completions (habit_id, updated_at desc);

create table if not exists public.completion_events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  action text not null check (action in ('done', 'undone')),
  operation_id text not null unique,
  actor_user_id uuid not null references public.users(id) on delete cascade,
  device_id text,
  version bigint not null,
  server_ts timestamptz not null default now()
);

create index if not exists completion_events_couple_server_ts_idx
  on public.completion_events (couple_id, server_ts desc);

alter table public.completion_events enable row level security;

create policy completion_events_read on public.completion_events
  for select using (couple_id = public.current_couple_id());

-- Service-role actions insert events; keep user insert disabled by default.

do $$
begin
  alter publication supabase_realtime add table public.completion_events;
exception
  when duplicate_object then null;
end $$;
