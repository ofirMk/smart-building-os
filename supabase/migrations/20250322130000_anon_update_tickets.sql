-- Allow anonymous updates on tickets for back-office dev (anon key).
-- Replace with authenticated policies when Supabase Auth is wired.

drop policy if exists "anon_update_tickets_dashboard" on public.tickets;

create policy "anon_update_tickets_dashboard"
on public.tickets
for update
to anon
using (true)
with check (true);
