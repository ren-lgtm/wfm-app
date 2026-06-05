create table if not exists day_notes (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  day_of_week text not null check (day_of_week in ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(week_start, day_of_week)
);

alter table day_notes enable row level security;
create policy "allow all" on day_notes for all using (true);
