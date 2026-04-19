-- Habit intent (build vs break) and optional consecutive-day goal for break habits.

alter table public.habits
  add column if not exists intent text not null default 'build'
    check (intent in ('build', 'break'));

alter table public.habits
  add column if not exists break_goal_days int null;

comment on column public.habits.intent is 'build = frequency habit; break = daily abstinence with break_goal_days target';
comment on column public.habits.break_goal_days is 'When intent=break: consecutive successful days goal';
