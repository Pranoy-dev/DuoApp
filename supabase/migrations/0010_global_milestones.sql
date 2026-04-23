-- Milestones become global (per user+tier), not per habit.
alter table public.milestones
  alter column habit_id drop not null;

-- Backfill existing rows to global semantics by keeping oldest row per user+tier.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, tier
      order by achieved_at asc, id asc
    ) as rn
  from public.milestones
)
delete from public.milestones m
using ranked r
where m.id = r.id
  and r.rn > 1;

alter table public.milestones
  drop constraint if exists milestones_user_id_habit_id_tier_key;

create unique index if not exists milestones_user_tier_unique
  on public.milestones (user_id, tier);
