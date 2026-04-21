-- Re-introduce a minimal quotes table for the day-complete celebration.
-- Service-role reads from server actions; authenticated clients get read-only
-- access to active rows as defense-in-depth. No per-user state, no per-day
-- pre-allocation, no history tables — deterministic pick happens server-side.

create table if not exists public.quotes (
    id uuid primary key default gen_random_uuid(),
    text text not null check (char_length(text) between 4 and 280),
    author text,
    category text,
    active boolean not null default true,
    created_at timestamptz not null default now()
);

create index if not exists quotes_active_idx on public.quotes (active);
create index if not exists quotes_category_idx on public.quotes (category);

alter table public.quotes enable row level security;

drop policy if exists quotes_read_active on public.quotes;
create policy quotes_read_active on public.quotes
    for select
    to authenticated
    using (active = true);

-- Seed set (~60 curated lines). Short, secular, warm, and relationship-aware.
insert into public.quotes (text, author, category) values
    ('Small steps every day, hand in hand.', null, 'daily'),
    ('The tiniest habit done today outlasts the loudest plan.', null, 'habits'),
    ('You showed up. That is the whole trick.', null, 'daily'),
    ('Consistency turns minutes into momentum.', null, 'habits'),
    ('Be proud of the quiet wins.', null, 'daily'),
    ('Streaks are built one ordinary evening at a time.', null, 'streak'),
    ('Done beats perfect, every single time.', null, 'habits'),
    ('Every repetition writes the next version of you.', null, 'habits'),
    ('Discipline is a gift you hand to your future self.', null, 'habits'),
    ('The best time to keep going was yesterday. The next best is now.', null, 'daily'),
    ('A loving partner notices the tiny stuff.', null, 'couple'),
    ('Cheer each other louder than the doubts.', null, 'couple'),
    ('Two people, one good habit — unstoppable.', null, 'couple'),
    ('When you grow, we grow.', null, 'couple'),
    ('You kept the promise you made to yourself.', null, 'daily'),
    ('Today you were stronger than the excuse.', null, 'daily'),
    ('Momentum is a kind of love letter to tomorrow.', null, 'daily'),
    ('Progress is boring on purpose — that is why it works.', null, 'habits'),
    ('Show up for the version of you that is still becoming.', null, 'daily'),
    ('Rest is not the opposite of progress — it fuels it.', null, 'rest'),
    ('Repetition is how the extraordinary hides.', null, 'habits'),
    ('A streak is just a long list of choosing yourself.', null, 'streak'),
    ('Today counts because you counted it.', null, 'daily'),
    ('Celebrate the check marks — they are receipts of effort.', null, 'daily'),
    ('You were gentle with yourself today. That matters.', null, 'wellbeing'),
    ('Tiny, repeated, inevitable.', null, 'habits'),
    ('Keep the promise, however small.', null, 'daily'),
    ('Your habits are your manifesto.', null, 'habits'),
    ('We are writing a long, quiet story together.', null, 'couple'),
    ('Every check is a hello to your future self.', null, 'daily'),
    ('Showing up beats showing off.', null, 'habits'),
    ('Another day, another small yes.', null, 'daily'),
    ('The body remembers what the mind keeps showing up to.', null, 'habits'),
    ('Two hearts, one streak.', null, 'couple'),
    ('Progress loves the patient.', null, 'habits'),
    ('Keep stacking good days.', null, 'streak'),
    ('Small, steady, unstoppable.', null, 'habits'),
    ('You did not skip today. That is the whole point.', null, 'streak'),
    ('Gentle consistency is its own superpower.', null, 'habits'),
    ('Today was an offering to the life you want.', null, 'daily'),
    ('Love looks a lot like a daily check-in.', null, 'couple'),
    ('Done with warmth, done well.', null, 'daily'),
    ('The ritual is the reward.', null, 'habits'),
    ('You chose yourself today — quietly, beautifully.', null, 'daily'),
    ('One day is an anecdote. Many days is a life.', null, 'habits'),
    ('Consistency is compound interest for the soul.', null, 'habits'),
    ('Keep the small fires burning.', null, 'daily'),
    ('A little better than yesterday is always enough.', null, 'daily'),
    ('You are practicing a life worth having.', null, 'daily'),
    ('The habit is the hug.', null, 'couple'),
    ('Streaks are a love letter to your future self.', null, 'streak'),
    ('Simple, repeated, honest.', null, 'habits'),
    ('You met today with care.', null, 'wellbeing'),
    ('The quiet days are the load-bearing ones.', null, 'habits'),
    ('You kept going. That is the headline.', null, 'daily'),
    ('Showing up gently still counts as showing up.', null, 'wellbeing'),
    ('Being consistent is its own kind of kindness.', null, 'wellbeing'),
    ('Good habits are a long, slow applause.', null, 'habits'),
    ('We are two people repeatedly choosing the long game.', null, 'couple'),
    ('You are the sum of what you repeat. Repeat well.', null, 'habits');
