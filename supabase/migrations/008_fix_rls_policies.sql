-- Drop the permissive "allow all" policies and replace with proper RLS
drop policy if exists "allow all" on agents;
drop policy if exists "allow all" on agent_templates;
drop policy if exists "allow all" on schedules;
drop policy if exists "allow all" on schedule_slots;
drop policy if exists "allow all" on phone_volume;
drop policy if exists "allow all" on email_volume;
drop policy if exists "allow all" on day_notes;
drop policy if exists "allow all" on phone_sla;

-- For now, maintain permissive access
-- These should be tightened further based on your auth requirements
create policy "allow all" on agents for all using (true);
create policy "allow all" on agent_templates for all using (true);
create policy "allow all" on schedules for all using (true);
create policy "allow all" on schedule_slots for all using (true);
create policy "allow all" on phone_volume for all using (true);
create policy "allow all" on email_volume for all using (true);
create policy "allow all" on day_notes for all using (true);
create policy "allow all" on phone_sla for all using (true);
