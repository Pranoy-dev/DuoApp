create table if not exists public.journal_user_buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  label text not null,
  normalized_label text not null,
  created_at timestamptz not null default now(),
  last_selected_at timestamptz,
  unique (user_id, normalized_label)
);

alter table public.journal_user_buckets enable row level security;

create policy journal_user_buckets_select_own on public.journal_user_buckets
  for select using (user_id = public.current_user_id());

create policy journal_user_buckets_insert_own on public.journal_user_buckets
  for insert with check (user_id = public.current_user_id());

create policy journal_user_buckets_update_own on public.journal_user_buckets
  for update using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

create policy journal_user_buckets_delete_own on public.journal_user_buckets
  for delete using (user_id = public.current_user_id());

create index if not exists journal_user_buckets_user_recency_idx
  on public.journal_user_buckets (user_id, last_selected_at desc nulls last);
