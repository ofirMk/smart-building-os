-- Allow anon read on amenities (back-office dashboard; tighten when auth is wired).

drop policy if exists "anon_select_amenities_dashboard" on public.amenities;

create policy "anon_select_amenities_dashboard"
on public.amenities
for select
to anon
using (true);
