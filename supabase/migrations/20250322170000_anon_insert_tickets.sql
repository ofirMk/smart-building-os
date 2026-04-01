-- Allow anonymous inserts on tickets for back-office dev (anon key).
-- Replace with authenticated policies when Supabase Auth is wired.

drop policy if exists "anon_insert_tickets_dashboard" on public.tickets;

create policy "anon_insert_tickets_dashboard"
on public.tickets
for insert
to anon
with check (true);
