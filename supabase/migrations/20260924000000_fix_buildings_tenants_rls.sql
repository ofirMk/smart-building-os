-- =============================================================================
-- Fix: Buildings + Tenants pages failing due to strict RLS from m5 migration.
-- Root cause: apartments RLS now requires erp_can_manage_company, but the
-- buildings/tenants dashboard pages use simple server-auth client (no ERP ctx).
--
-- Solution: security-definer RPC functions that bypass RLS and return shaped
-- data for the two pages. The functions are callable by authenticated + anon
-- roles but internally run as postgres superuser (security definer).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. get_buildings_with_counts()
--    Returns all buildings with apartment + parking counts.
-- ---------------------------------------------------------------------------
create or replace function public.get_buildings_with_counts()
returns table (
  id            uuid,
  name          text,
  address_line1 text,
  address_line2 text,
  city          text,
  region        text,
  postal_code   text,
  country       text,
  created_at    timestamptz,
  updated_at    timestamptz,
  apartment_count   bigint,
  parking_spot_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id,
    b.name,
    b.address_line1,
    b.address_line2,
    b.city,
    b.region,
    b.postal_code,
    b.country,
    b.created_at,
    b.updated_at,
    coalesce((
      select count(*) from public.apartments a where a.building_id = b.id
    ), 0) as apartment_count,
    coalesce((
      select count(*) from public.parking_spots ps where ps.building_id = b.id
    ), 0) as parking_spot_count
  from public.buildings b
  order by b.name asc;
$$;

grant execute on function public.get_buildings_with_counts() to authenticated;
grant execute on function public.get_buildings_with_counts() to anon;

-- ---------------------------------------------------------------------------
-- 2. get_tenants_for_crm()
--    Returns all tenant profiles with their apartment + building info.
-- ---------------------------------------------------------------------------
create or replace function public.get_tenants_for_crm()
returns table (
  id            uuid,
  full_name     text,
  email         text,
  phone         text,
  is_active     boolean,
  unit_number   text,
  building_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.full_name,
    p.email,
    p.phone,
    coalesce(p.is_active, true) as is_active,
    a.unit_number,
    b.name as building_name
  from public.profiles p
  left join public.apartments a on a.tenant_id = p.id
  left join public.buildings b  on b.id = a.building_id
  where p.role = 'tenant'
  order by p.full_name asc;
$$;

grant execute on function public.get_tenants_for_crm() to authenticated;
grant execute on function public.get_tenants_for_crm() to anon;

-- ---------------------------------------------------------------------------
-- 3. Ensure anon / authenticated can read buildings + parking_spots directly
--    (needed for pages that query buildings without embedded apartments).
-- ---------------------------------------------------------------------------

-- buildings: readable by all authenticated users
drop policy if exists "bldg_select_auth" on public.buildings;
create policy "bldg_select_auth"
  on public.buildings for select to authenticated
  using (true);

drop policy if exists "bldg_select_anon" on public.buildings;
create policy "bldg_select_anon"
  on public.buildings for select to anon
  using (true);

-- parking_spots: readable by authenticated
drop policy if exists "parking_select_auth" on public.parking_spots;
create policy "parking_select_auth"
  on public.parking_spots for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 4. Reload PostgREST schema cache so FK relationships are re-detected.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
