alter table agents add column if not exists email text;

create table if not exists app_users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  role       text not null check (role in ('admin', 'lead', 'member')),
  agent_id   uuid references agents(id) on delete set null,
  created_at timestamptz default now()
);

alter table app_users disable row level security;

insert into app_users (email, role) values ('ren@fractionalcx.com', 'admin')
  on conflict (email) do nothing;
