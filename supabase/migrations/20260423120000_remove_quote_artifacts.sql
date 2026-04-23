-- Remove remaining quote-related tables and policies.
-- Forward-only cleanup migration; historical migrations stay unchanged.

drop policy if exists quotes_read_active on public.quotes;
drop table if exists public.user_quote_rotation cascade;
drop table if exists public.user_quote_history cascade;
drop table if exists public.user_quote_progress cascade;
drop table if exists public.quote_categories cascade;
drop table if exists public.quotes cascade;
