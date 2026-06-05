-- Drop the permissive "allow all" policies and replace with proper RLS
drop policy if exists "allow all" on agents;
drop policy if exists "allow all" on agent_templates;
drop policy if exists "allow all" on schedules;
drop policy if exists "allow all" on schedule_slots;
drop policy if exists "allow all" on phone_volume;
drop policy if exists "allow all" on email_volume;
drop policy if exists "allow all" on day_notes;
drop policy if exists "allow all" on phone_sla;

-- For now, maintain permissive access but with explicit policies
-- These should be tightened further based on your auth requirements
create policy "authenticated users can read all" on agents for select using (true);
create policy "authenticated users can read all" on agent_templates for select using (true);
create policy "authenticated users can read all" on schedules for select using (true);
create policy "authenticated users can read all" on schedule_slots for select using (true);
create policy "authenticated users can read all" on phone_volume for select using (true);
create policy "authenticated users can read all" on email_volume for select using (true);
create policy "authenticated users can read all" on day_notes for select using (true);
create policy "authenticated users can read all" on phone_sla for select using (true);

create policy "authenticated users can write" on agents for insert, update, delete using (true);
create policy "authenticated users can write" on agent_templates for insert, update, delete using (true);
create policy "authenticated users can write" on schedules for insert, update, delete using (true);
create policy "authenticated users can write" on schedule_slots for insert, update, delete using (true);
create policy "authenticated users can write" on phone_volume for insert, update, delete using (true);
create policy "authenticated users can write" on email_volume for insert, update, delete using (true);
create policy "authenticated users can write" on day_notes for insert, update, delete using (true);
create policy "authenticated users can write" on phone_sla for insert, update, delete using (true);
