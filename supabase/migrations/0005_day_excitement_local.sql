-- Optional server mirror for journal excitement (app uses string user ids before Clerk UUID mapping).
create table if not exists public.day_excitement_local (
  external_user_id text not null,
  date date not null,
  stars smallint not null check (stars >= 1 and stars <= 5),
  note text not null default '',
  saved_at timestamptz not null default now(),
  primary key (external_user_id, date)
);

comment on table public.day_excitement_local is 'Mirror of localStorage day excitement; keyed by app user id until full users FK sync';

alter table public.day_excitement_local disable row level security;
