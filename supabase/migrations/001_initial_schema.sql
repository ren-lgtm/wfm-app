-- Agents table
create table agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  role text not null check (role in ('phone', 'email', 'both')),
  default_channel text not null check (default_channel in ('phone', 'email')),
  color text not null default '#378ADD',
  active boolean not null default true,
  created_at timestamptz default now()
);

-- Agent weekly availability templates (default recurring schedule)
create table agent_templates (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references agents(id) on delete cascade,
  day_of_week text not null check (day_of_week in ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  start_hour int check (start_hour >= 0 and start_hour <= 23),
  end_hour int check (end_hour >= 0 and end_hour <= 23),
  channel text check (channel in ('phone','email','both','off')),
  lunch_hour int,
  is_off boolean default false,
  created_at timestamptz default now(),
  unique(agent_id, day_of_week)
);

-- Weekly schedules (week-specific overrides)
create table schedules (
  id uuid primary key default gen_random_uuid(),
  week_start date not null, -- always a Monday
  agent_id uuid references agents(id) on delete cascade,
  day_of_week text not null check (day_of_week in ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  is_off boolean default false,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(week_start, agent_id, day_of_week)
);

-- Schedule slots (hour-by-hour assignments)
create table schedule_slots (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references schedules(id) on delete cascade,
  hour int not null check (hour >= 0 and hour <= 23),
  activity text not null check (activity in ('phone','email','lunch','off')),
  created_at timestamptz default now(),
  unique(schedule_id, hour)
);

-- Historical phone volume (from Aircall)
create table phone_volume (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  hour int not null check (hour >= 0 and hour <= 23),
  call_count int not null default 0,
  day_of_week text generated always as (
    to_char(date, 'Dy')
  ) stored,
  created_at timestamptz default now(),
  unique(date, hour)
);

-- Historical email volume (from Gorgias)
create table email_volume (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  hour int not null check (hour >= 0 and hour <= 23),
  tickets_created int not null default 0,
  tickets_responded int not null default 0,
  day_of_week text generated always as (
    to_char(date, 'Dy')
  ) stored,
  created_at timestamptz default now(),
  unique(date, hour)
);

-- Seed agents
insert into agents (name, email, role, default_channel, color) values
  ('Deb', null, 'email', 'email', '#7C3AED'),
  ('Ezra', null, 'email', 'email', '#0891B2'),
  ('Lucy', null, 'phone', 'phone', '#059669'),
  ('Delaney', null, 'phone', 'phone', '#D97706'),
  ('Allison', null, 'phone', 'phone', '#DC2626'),
  ('Dolly', null, 'phone', 'phone', '#DB2777'),
  ('Lori', null, 'both', 'phone', '#65A30D');

-- RLS policies (enable for production)
alter table agents enable row level security;
alter table agent_templates enable row level security;
alter table schedules enable row level security;
alter table schedule_slots enable row level security;
alter table phone_volume enable row level security;
alter table email_volume enable row level security;

-- For now allow all (you'll tighten this with Supabase Auth later)
create policy "allow all" on agents for all using (true);
create policy "allow all" on agent_templates for all using (true);
create policy "allow all" on schedules for all using (true);
create policy "allow all" on schedule_slots for all using (true);
create policy "allow all" on phone_volume for all using (true);
create policy "allow all" on email_volume for all using (true);
