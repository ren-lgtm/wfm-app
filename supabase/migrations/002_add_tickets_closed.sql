alter table email_volume
  add column if not exists tickets_closed int not null default 0;
