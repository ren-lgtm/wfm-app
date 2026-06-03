create table if not exists agent_metrics (
  date          date        not null,
  agent_name    text        not null,
  tickets_closed integer    not null default 0,
  online_time_seconds integer,
  primary key (date, agent_name)
);
