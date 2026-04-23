create table if not exists public.user_quote_rotation (
  user_id uuid primary key references public.users(id) on delete cascade,
  last_quote_id uuid references public.quotes(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.user_quote_rotation enable row level security;

drop policy if exists user_quote_rotation_select_own on public.user_quote_rotation;
create policy user_quote_rotation_select_own on public.user_quote_rotation
  for select using (user_id = public.current_user_id());

drop policy if exists user_quote_rotation_insert_own on public.user_quote_rotation;
create policy user_quote_rotation_insert_own on public.user_quote_rotation
  for insert with check (user_id = public.current_user_id());

drop policy if exists user_quote_rotation_update_own on public.user_quote_rotation;
create policy user_quote_rotation_update_own on public.user_quote_rotation
  for update using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());
