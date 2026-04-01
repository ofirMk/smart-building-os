-- Extend dashboard_stats (runs after profiles.is_active exists): active tenants + open tickets only

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
    'active_tenants',
    (
      select count(*)::int
      from public.profiles
      where role = 'tenant'
        and coalesce(is_active, true) = true
    ),
    'open_tickets',
    (
      select count(*)::int
      from public.tickets
      where status = 'open'
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
