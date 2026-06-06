-- Named template (one per template, e.g. "Standard Week")
create table schedule_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Standard Week',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- Per-agent, per-day slots within a template (mirrors schedules + schedule_slots)
create table template_schedules (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references schedule_templates(id) on delete cascade,
  agent_id uuid references agents(id) on delete cascade,
  day_of_week text not null check (day_of_week in ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  is_off boolean default false,
  unique(template_id, agent_id, day_of_week)
);

-- Hour-by-hour slots for each template_schedule row
create table template_slots (
  id uuid primary key default gen_random_uuid(),
  template_schedule_id uuid references template_schedules(id) on delete cascade,
  hour int not null check (hour >= 0 and hour <= 23),
  activity text not null,
  unique(template_schedule_id, hour)
);

-- RLS
alter table schedule_templates enable row level security;
alter table template_schedules enable row level security;
alter table template_slots enable row level security;
create policy "allow all" on schedule_templates for all using (true);
create policy "allow all" on template_schedules for all using (true);
create policy "allow all" on template_slots for all using (true);
