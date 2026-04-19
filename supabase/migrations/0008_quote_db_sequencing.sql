-- Quote catalog + per-user sequencing cursor + no-repeat history.

create table if not exists public.quote_categories (
  id text primary key,
  label text not null,
  sort_order int not null unique
);

create table if not exists public.quotes (
  id text primary key,
  category_id text not null references public.quote_categories(id) on delete cascade,
  position_in_category int not null,
  text text not null,
  author text not null,
  unique (category_id, position_in_category)
);

create index if not exists quotes_category_position_idx
  on public.quotes (category_id, position_in_category);

create table if not exists public.user_quote_progress (
  user_id uuid primary key references public.users(id) on delete cascade,
  current_category_id text not null references public.quote_categories(id),
  next_position int not null default 1 check (next_position >= 1),
  completed boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_quote_history (
  user_id uuid not null references public.users(id) on delete cascade,
  quote_id text not null references public.quotes(id) on delete cascade,
  shown_at timestamptz not null default now(),
  primary key (user_id, quote_id)
);

create index if not exists user_quote_history_user_shown_idx
  on public.user_quote_history (user_id, shown_at desc);

alter table public.quote_categories enable row level security;
alter table public.quotes enable row level security;
alter table public.user_quote_progress enable row level security;
alter table public.user_quote_history enable row level security;

create policy quote_categories_read on public.quote_categories
  for select using (true);

create policy quotes_read on public.quotes
  for select using (true);

create policy user_quote_progress_rw on public.user_quote_progress
  for all using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

create policy user_quote_history_rw on public.user_quote_history
  for all using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id());

-- Category order is fixed and deterministic.
insert into public.quote_categories (id, label, sort_order)
values
  ('stoic', 'Stoic', 1),
  ('self-compassion', 'Gentle', 2),
  ('humor', 'Playful', 3),
  ('athletic', 'Athletic', 4),
  ('creative', 'Creative', 5)
on conflict (id) do update
set label = excluded.label,
    sort_order = excluded.sort_order;

-- Seed quotes. This is the initial import block; can be extended to full 1000 quote set.
insert into public.quotes (id, category_id, position_in_category, text, author)
values
  ('s1', 'stoic', 1, 'You have power over your mind — not outside events. Realize this, and you will find strength.', 'Marcus Aurelius'),
  ('s2', 'stoic', 2, 'We suffer more often in imagination than in reality.', 'Seneca'),
  ('s3', 'stoic', 3, 'Waste no more time arguing what a good person should be. Be one.', 'Marcus Aurelius'),
  ('s4', 'stoic', 4, 'First say to yourself what you would be; and then do what you have to do.', 'Epictetus'),
  ('s5', 'stoic', 5, 'He who fears death will never do anything worthy of a living person.', 'Seneca'),
  ('c1', 'self-compassion', 1, 'Talk to yourself like someone you love.', 'Brené Brown'),
  ('c2', 'self-compassion', 2, 'You do not have to be good. You only have to let the soft animal of your body love what it loves.', 'Mary Oliver'),
  ('c3', 'self-compassion', 3, 'Rest is a form of resistance.', 'Tricia Hersey'),
  ('c4', 'self-compassion', 4, 'Be gentle with yourself, you are a child of the universe.', 'Max Ehrmann'),
  ('c5', 'self-compassion', 5, 'You are allowed to be both a masterpiece and a work in progress.', 'Sophia Bush'),
  ('h1', 'humor', 1, 'The secret of getting ahead is getting started. And also snacks.', 'Mostly Mark Twain'),
  ('h2', 'humor', 2, 'Discipline is remembering what you actually want when your couch is flirting with you.', 'Anon'),
  ('h3', 'humor', 3, 'Showing up is 80% of life. The other 20% is coffee.', 'Anon'),
  ('h4', 'humor', 4, 'You can do hard things. You can also do them badly. Both count.', 'Anon'),
  ('h5', 'humor', 5, 'Do one small thing and tell nobody. That''s the trick.', 'Anon'),
  ('a1', 'athletic', 1, 'You don''t rise to the level of your goals. You fall to the level of your systems.', 'James Clear'),
  ('a2', 'athletic', 2, 'Pain is temporary. Quitting lasts forever.', 'Lance Armstrong'),
  ('a3', 'athletic', 3, 'Every champion was once a contender who refused to give up.', 'Rocky Balboa'),
  ('a4', 'athletic', 4, 'Do it again, a little better.', 'Anon'),
  ('a5', 'athletic', 5, 'Small reps, every day. That''s the whole secret.', 'Anon'),
  ('r1', 'creative', 1, 'Inspiration is for amateurs. The rest of us just show up and get to work.', 'Chuck Close'),
  ('r2', 'creative', 2, 'The work will teach you how to do it.', 'Estonian proverb'),
  ('r3', 'creative', 3, 'You can''t think your way into a finished thing. You have to make it.', 'Anon'),
  ('r4', 'creative', 4, 'Nulla dies sine linea. Not a day without a line.', 'Pliny the Elder'),
  ('r5', 'creative', 5, 'Finish. Anything. That''s the whole game.', 'Anon')
on conflict (id) do update
set category_id = excluded.category_id,
    position_in_category = excluded.position_in_category,
    text = excluded.text,
    author = excluded.author;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_quote_id_fkey'
  ) then
    alter table public.journal_entries
      add constraint journal_entries_quote_id_fkey
      foreign key (quote_id) references public.quotes(id);
  end if;
end $$;
