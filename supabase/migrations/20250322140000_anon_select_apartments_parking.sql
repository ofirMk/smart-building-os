-- Required for PostgREST embedded counts on buildings:
-- select('*, apartments(count), parking_spots(count)')
-- anon must be able to read rows in the related tables (RLS applies per row).

drop policy if exists "anon_select_apartments_dashboard" on public.apartments;
drop policy if exists "anon_select_parking_spots_dashboard" on public.parking_spots;

create policy "anon_select_apartments_dashboard"
on public.apartments
for select
to anon
using (true);

create policy "anon_select_parking_spots_dashboard"
on public.parking_spots
for select
to anon
using (true);
