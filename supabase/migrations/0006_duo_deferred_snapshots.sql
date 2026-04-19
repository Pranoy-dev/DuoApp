-- Local-first Duo: optional JSON snapshot per Clerk user (deferred batch sync).

create table if not exists public.duo_deferred_snapshots (
  clerk_id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists duo_deferred_snapshots_updated_at_idx
  on public.duo_deferred_snapshots (updated_at desc);

alter table public.duo_deferred_snapshots enable row level security;

comment on table public.duo_deferred_snapshots is
  'Full AppState JSON per Clerk id; written by service role after Clerk auth in Server Actions only.';
