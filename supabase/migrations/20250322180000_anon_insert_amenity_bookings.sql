-- Allow anonymous inserts on amenity_bookings for tenant portal MVP (anon key).
-- Replace with authenticated policies when Supabase Auth is wired.

drop policy if exists "anon_insert_amenity_bookings_tenant" on public.amenity_bookings;

create policy "anon_insert_amenity_bookings_tenant"
on public.amenity_bookings
for insert
to anon
with check (true);
