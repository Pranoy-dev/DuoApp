create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  mood smallint not null check (mood >= 1 and mood <= 10),
  prompt_id text not null default '',
  prompt_text text not null default '',
  reflection text not null default '',
  cause_buckets text[] not null default '{}'::text[]
    check (cause_buckets <@ array['Sleep','Work','Body','Relationship','Social','Finance','Purpose','Random']::text[]),
  saved_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.journal_entries enable row level security;

create policy journal_entries_select_own on public.journal_entries
  for select using (user_id = public.current_user_id());

create policy journal_entries_insert_own on public.journal_entries
  for insert with check (user_id = public.current_user_id());

create policy journal_entries_update_own on public.journal_entries
  for update using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

create policy journal_entries_delete_own on public.journal_entries
  for delete using (user_id = public.current_user_id());

create index if not exists journal_entries_user_date_idx
  on public.journal_entries (user_id, date desc);
