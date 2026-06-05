create table if not exists phone_sla (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  hour int not null check (hour >= 0 and hour <= 23),
  day_of_week text,
  answered int not null default 0,
  missed int not null default 0,
  avg_wait_secs int,
  created_at timestamptz default now(),
  unique(date, hour)
);

alter table phone_sla enable row level security;
create policy "allow all" on phone_sla for all using (true);
