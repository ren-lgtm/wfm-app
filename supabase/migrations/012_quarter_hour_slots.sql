-- Move schedule/template slots from hour granularity (0-23) to 15-minute
-- quarter granularity (0-95). Quarter q represents the 15-min block starting
-- at (q*15) minutes past midnight, i.e. hour = floor(q/4), minute = (q%4)*15.
--
-- Existing rows store a full hour at index h; we expand each into the four
-- quarters h*4, h*4+1, h*4+2, h*4+3 so existing schedules are preserved exactly.
--
-- SAFE TO RE-RUN? No — run once. Take a backup first if this is production data.

begin;

-- ── schedule_slots ──────────────────────────────────────────────────────────
alter table schedule_slots drop constraint if exists schedule_slots_hour_check;

-- 1) shift existing hour indices to their :00 quarter (h -> h*4)
update schedule_slots set hour = hour * 4;

-- 2) fan out each :00 quarter into the remaining three quarters of that hour
insert into schedule_slots (schedule_id, hour, activity)
select s.schedule_id, s.hour + o.offset, s.activity
from schedule_slots s
cross join (values (1), (2), (3)) as o(offset)
where s.hour % 4 = 0;

alter table schedule_slots add constraint schedule_slots_hour_check
  check (hour >= 0 and hour <= 95);

-- ── template_slots ──────────────────────────────────────────────────────────
alter table template_slots drop constraint if exists template_slots_hour_check;

update template_slots set hour = hour * 4;

insert into template_slots (template_schedule_id, hour, activity)
select t.template_schedule_id, t.hour + o.offset, t.activity
from template_slots t
cross join (values (1), (2), (3)) as o(offset)
where t.hour % 4 = 0;

alter table template_slots add constraint template_slots_hour_check
  check (hour >= 0 and hour <= 95);

commit;
