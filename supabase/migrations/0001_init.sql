-- Duo — initial schema
-- Designed for Supabase (Postgres + RLS). Clerk owns identity; we store the
-- Clerk user id as text in `users.clerk_id`. All access is mediated by the
-- `couple_members` junction to prevent leakage across pairs.

create extension if not exists pgcrypto;

create table if not exists public.users (
    id uuid primary key default gen_random_uuid(),
    clerk_id text unique not null,
    name text not null,
    emoji text not null default '✦',
    tone text not null default 'stoic',
    grace_enabled boolean not null default true,
    timezone text not null default 'UTC',
    created_at timestamptz not null default now()
);

create table if not exists public.couples (
    id uuid primary key default gen_random_uuid(),
    invite_code text unique not null,
    created_at timestamptz not null default now()
);

create table if not exists public.couple_members (
    couple_id uuid not null references public.couples(id) on delete cascade,
    user_id uuid not null references public.users(id) on delete cascade,
    role text not null default 'member',
    joined_at timestamptz not null default now(),
    primary key (couple_id, user_id)
);

create table if not exists public.invites (
    code text primary key,
    couple_id uuid not null references public.couples(id) on delete cascade,
    created_by uuid not null references public.users(id) on delete cascade,
    consumed_by uuid references public.users(id) on delete set null,
    expires_at timestamptz not null default (now() + interval '14 days'),
    created_at timestamptz not null default now()
);

create table if not exists public.habits (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.users(id) on delete cascade,
    couple_id uuid not null references public.couples(id) on delete cascade,
    name text not null,
    emoji text not null default '✦',
    type text not null check (type in ('daily', 'frequency')),
    visibility text not null check (visibility in ('solo', 'shared')),
    target_per_week int,
    week_starts_on int default 1,
    created_at timestamptz not null default now()
);

create table if not exists public.habit_completions (
    id uuid primary key default gen_random_uuid(),
    habit_id uuid not null references public.habits(id) on delete cascade,
    user_id uuid not null references public.users(id) on delete cascade,
    date date not null,
    created_at timestamptz not null default now(),
    unique (habit_id, user_id, date)
);

create table if not exists public.grace_ledger (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    habit_id uuid not null references public.habits(id) on delete cascade,
    month text not null,
    used_on date not null,
    unique (user_id, habit_id, month)
);

create table if not exists public.cheers (
    id uuid primary key default gen_random_uuid(),
    from_user uuid not null references public.users(id) on delete cascade,
    to_user uuid not null references public.users(id) on delete cascade,
    habit_id uuid references public.habits(id) on delete set null,
    read_at timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists public.milestones (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    habit_id uuid not null references public.habits(id) on delete cascade,
    tier int not null,
    achieved_at timestamptz not null default now(),
    unique (user_id, habit_id, tier)
);

create table if not exists public.journal_entries (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    date date not null,
    quote_id text not null,
    created_at timestamptz not null default now(),
    unique (user_id, date)
);

-- Helper: resolve the current Clerk subject to our users.id.
create or replace function public.current_user_id() returns uuid
language sql stable as $$
    select id from public.users
    where clerk_id = coalesce(
        nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', ''),
        current_setting('request.jwt.claim.sub', true)
    )
    limit 1
$$;

-- Helper: the caller's couple id (assumes at most one active couple per user).
create or replace function public.current_couple_id() returns uuid
language sql stable as $$
    select couple_id from public.couple_members
    where user_id = public.current_user_id()
    limit 1
$$;

-- Enable RLS on everything that's user-scoped.
alter table public.users enable row level security;
alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.invites enable row level security;
alter table public.habits enable row level security;
alter table public.habit_completions enable row level security;
alter table public.grace_ledger enable row level security;
alter table public.cheers enable row level security;
alter table public.milestones enable row level security;
alter table public.journal_entries enable row level security;

-- Users: you can read / update yourself. Partner rows are read via couple join.
create policy users_self_read on public.users
    for select using (id = public.current_user_id() or id in (
        select user_id from public.couple_members
        where couple_id = public.current_couple_id()
    ));
create policy users_self_write on public.users
    for update using (id = public.current_user_id())
    with check (id = public.current_user_id());

-- Couples: members can see their couple.
create policy couples_member_read on public.couples
    for select using (id = public.current_couple_id());

-- Members: see rows where you (or the other partner) are listed.
create policy couple_members_read on public.couple_members
    for select using (couple_id = public.current_couple_id());

-- Habits: shared habits are visible to both members; solo only to owner.
create policy habits_read on public.habits
    for select using (
        couple_id = public.current_couple_id()
        and (visibility = 'shared' or owner_id = public.current_user_id())
    );
create policy habits_insert on public.habits
    for insert with check (
        owner_id = public.current_user_id()
        and couple_id = public.current_couple_id()
    );
create policy habits_update on public.habits
    for update using (owner_id = public.current_user_id())
    with check (owner_id = public.current_user_id());
create policy habits_delete on public.habits
    for delete using (owner_id = public.current_user_id());

-- Completions: visible if the habit itself is visible; writes only by owner.
create policy completions_read on public.habit_completions
    for select using (
        habit_id in (
            select id from public.habits
            where couple_id = public.current_couple_id()
              and (visibility = 'shared' or owner_id = public.current_user_id())
        )
    );
create policy completions_write on public.habit_completions
    for all using (user_id = public.current_user_id())
    with check (user_id = public.current_user_id());

-- Cheers: you can see cheers involving you; you can send from yourself to
-- your partner (same couple).
create policy cheers_read on public.cheers
    for select using (
        from_user = public.current_user_id()
        or to_user = public.current_user_id()
    );
create policy cheers_send on public.cheers
    for insert with check (
        from_user = public.current_user_id()
        and to_user in (
            select user_id from public.couple_members
            where couple_id = public.current_couple_id()
              and user_id <> public.current_user_id()
        )
    );
create policy cheers_update_own on public.cheers
    for update using (to_user = public.current_user_id())
    with check (to_user = public.current_user_id());

-- Milestones & journal: own-row policies.
create policy milestones_read on public.milestones
    for select using (
        user_id = public.current_user_id()
        or user_id in (
            select user_id from public.couple_members
            where couple_id = public.current_couple_id()
        )
    );
create policy milestones_write on public.milestones
    for all using (user_id = public.current_user_id())
    with check (user_id = public.current_user_id());

create policy journal_read on public.journal_entries
    for select using (user_id = public.current_user_id());
create policy journal_write on public.journal_entries
    for all using (user_id = public.current_user_id())
    with check (user_id = public.current_user_id());

-- Invites: readable by the couple and by anyone with the code (for the join
-- landing). Creation only by a couple member.
create policy invites_read on public.invites
    for select using (
        couple_id = public.current_couple_id()
        or code = current_setting('request.header.x-invite-code', true)
    );
create policy invites_insert on public.invites
    for insert with check (
        couple_id = public.current_couple_id()
        and created_by = public.current_user_id()
    );

-- Grace: own rows only.
create policy grace_rw on public.grace_ledger
    for all using (user_id = public.current_user_id())
    with check (user_id = public.current_user_id());

-- Helpful indexes.
create index if not exists habits_couple_idx on public.habits (couple_id);
create index if not exists completions_habit_user_date_idx
    on public.habit_completions (habit_id, user_id, date);
create index if not exists cheers_to_user_idx on public.cheers (to_user, created_at desc);
create index if not exists milestones_user_idx on public.milestones (user_id);
