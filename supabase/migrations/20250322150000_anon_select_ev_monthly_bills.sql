-- Allow anon read on monthly EV bills (back-office dashboard; tighten when auth is wired).

drop policy if exists "anon_select_ev_monthly_bills_dashboard" on public.ev_monthly_bills;

create policy "anon_select_ev_monthly_bills_dashboard"
on public.ev_monthly_bills
for select
to anon
using (true);
