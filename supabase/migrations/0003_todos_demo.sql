-- Demo todos table for Next.js /todos Supabase smoke test (also applied via MCP).
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

comment on table public.todos is 'Demo list for Next.js /todos Supabase smoke test';

alter table public.todos enable row level security;

create policy "todos_select_demo" on public.todos
  for select
  to anon, authenticated
  using (true);

create policy "todos_insert_demo" on public.todos
  for insert
  to anon, authenticated
  with check (true);
