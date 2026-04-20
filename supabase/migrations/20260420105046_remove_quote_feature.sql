-- Remove quote feature schema and data surfaces.

drop table if exists public.journal_entries cascade;
drop table if exists public.user_quote_history cascade;
drop table if exists public.user_quote_progress cascade;
drop table if exists public.quotes cascade;
drop table if exists public.quote_categories cascade;

alter table if exists public.users
  drop column if exists tone;
