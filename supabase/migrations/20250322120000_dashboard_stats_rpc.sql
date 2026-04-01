-- Aggregated dashboard metrics for the Next.js home page (anon-safe via SECURITY DEFINER).
-- Boundaries use Asia/Jerusalem for "current month" and "today".

create or replace function public.dashboard_stats ()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'buildings',
    (select count(*)::int from public.buildings),
    'open_tickets',
    (
      select count(*)::int
      from public.tickets
      where status in ('open', 'in_progress')
    ),
    'ev_kwh_month',
    coalesce(
      (
        select sum(kwh)
        from public.ev_charging_sessions
        where
          started_at
          >= (
            date_trunc('month', now() at time zone 'Asia/Jerusalem') at time zone 'Asia/Jerusalem'
          )
          and started_at
          < (
            (
              date_trunc('month', now() at time zone 'Asia/Jerusalem')
              + interval '1 month'
            ) at time zone 'Asia/Jerusalem'
          )
      ),
      0
    )::double precision,
    'amenity_bookings_today',
    (
      select count(*)::int
      from public.amenity_bookings
      where
        starts_at
        >= (
          date_trunc('day', now() at time zone 'Asia/Jerusalem') at time zone 'Asia/Jerusalem'
        )
        and starts_at
        < (
          (
            date_trunc('day', now() at time zone 'Asia/Jerusalem')
            + interval '1 day'
          ) at time zone 'Asia/Jerusalem'
        )
    )
  );
$$;

grant execute on function public.dashboard_stats () to anon;

grant execute on function public.dashboard_stats () to authenticated;

-- Fallback for clients that query tables directly (e.g. if RPC is not deployed yet).
-- Tighten or remove in production once auth is wired.

drop policy if exists "anon_select_buildings_dashboard" on public.buildings;
drop policy if exists "anon_select_tickets_dashboard" on public.tickets;
drop policy if exists "anon_select_ev_sessions_dashboard" on public.ev_charging_sessions;
drop policy if exists "anon_select_amenity_bookings_dashboard" on public.amenity_bookings;

create policy "anon_select_buildings_dashboard"
on public.buildings
for select
to anon
using (true);

create policy "anon_select_tickets_dashboard"
on public.tickets
for select
to anon
using (true);

create policy "anon_select_ev_sessions_dashboard"
on public.ev_charging_sessions
for select
to anon
using (true);

create policy "anon_select_amenity_bookings_dashboard"
on public.amenity_bookings
for select
to anon
using (true);
