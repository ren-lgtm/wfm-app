-- Remove the restrictive CHECK constraint on schedule_slots.activity to allow custom shift types
-- The app uses custom shift types stored in localStorage (e.g., 'break', 'meeting', 'training')
-- which don't match the original hardcoded constraint

-- PostgreSQL doesn't support dropping individual constraints directly, so we recreate the table
-- Step 1: Create new table without the activity constraint
create table schedule_slots_new (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references schedules(id) on delete cascade,
  hour int not null check (hour >= 0 and hour <= 23),
  activity text not null,
  created_at timestamptz default now(),
  unique(schedule_id, hour)
);

-- Step 2: Copy existing data from old table
insert into schedule_slots_new (id, schedule_id, hour, activity, created_at)
select id, schedule_id, hour, activity, created_at from schedule_slots;

-- Step 3: Drop the old table (RLS policies are automatically dropped)
drop table schedule_slots;

-- Step 4: Rename new table to replace old one
alter table schedule_slots_new rename to schedule_slots;

-- Step 5: Re-enable RLS with the same policies
alter table schedule_slots enable row level security;
create policy "allow all" on schedule_slots for all using (true);
