-- =============================================================================
-- Fix: Buildings + Tenants pages DB errors.
-- Root cause: Production DB has schema drift — apartments/parking_spots tables
-- don't exist, buildings table is missing address/timestamp columns.
-- The initial_schema.sql was applied to a different DB version. This migration
-- creates what's missing and adds security-definer RPC helpers.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Schema-drift guard: ensure address + timestamp columns exist on buildings.
-- ---------------------------------------------------------------------------
alter table public.buildings add column if not exists address_line1 text null;
alter table public.buildings add column if not exists address_line2 text null;
alter table public.buildings add column if not exists city         text null;
alter table public.buildings add column if not exists region       text null;
alter table public.buildings add column if not exists postal_code  text null;
alter table public.buildings add column if not exists country      text null default 'IL';
alter table public.buildings add column if not exists created_at   timestamptz null default now();
alter table public.buildings add column if not exists updated_at   timestamptz null default now();

-- ---------------------------------------------------------------------------
-- 1. Create apartments table if it doesn't exist.
-- ---------------------------------------------------------------------------
create table if not exists public.apartments (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  unit_number text not null,
  floor       integer,
  bedrooms    integer,
  tenant_id   uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (building_id, unit_number)
);

create index if not exists apartments_building_id_idx on public.apartments (building_id);
create index if not exists apartments_tenant_id_idx   on public.apartments (tenant_id);

-- company_id on apartments (needed by M5 RLS policies)
do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='erp_companies') then
    alter table public.apartments add column if not exists company_id text null
      references public.erp_companies(id) on delete restrict;
  end if;
end;
$$;

alter table public.apartments enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Create parking_spots table if it doesn't exist.
-- ---------------------------------------------------------------------------
create table if not exists public.parking_spots (
  id                 uuid primary key default gen_random_uuid(),
  building_id        uuid not null references public.buildings(id) on delete cascade,
  label              text not null,
  ev_ready           boolean not null default true,
  assigned_tenant_id uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (building_id, label)
);

create index if not exists parking_spots_building_id_idx on public.parking_spots (building_id);

alter table public.parking_spots enable row level security;

-- ---------------------------------------------------------------------------
-- 3. get_buildings_with_counts() — security definer, bypasses RLS
-- ---------------------------------------------------------------------------
create or replace function public.get_buildings_with_counts()
returns table (
  id                 uuid,
  name               text,
  address_line1      text,
  address_line2      text,
  city               text,
  region             text,
  postal_code        text,
  country            text,
  created_at         timestamptz,
  updated_at         timestamptz,
  apartment_count    bigint,
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
    coalesce((select count(*) from public.apartments    a  where a.building_id  = b.id), 0) as apartment_count,
    coalesce((select count(*) from public.parking_spots ps where ps.building_id = b.id), 0) as parking_spot_count
  from public.buildings b
  order by b.name asc;
$$;

grant execute on function public.get_buildings_with_counts() to authenticated;
grant execute on function public.get_buildings_with_counts() to anon;

-- ---------------------------------------------------------------------------
-- 4. get_tenants_for_crm() — security definer, bypasses RLS
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
  left join public.buildings  b on b.id = a.building_id
  where p.role = 'tenant'
  order by p.full_name asc;
$$;

grant execute on function public.get_tenants_for_crm() to authenticated;
grant execute on function public.get_tenants_for_crm() to anon;

-- ---------------------------------------------------------------------------
-- 5. RLS: permissive read policies on buildings + parking_spots
-- ---------------------------------------------------------------------------
drop policy if exists "bldg_select_auth"    on public.buildings;
drop policy if exists "bldg_select_anon"    on public.buildings;
drop policy if exists "parking_select_auth" on public.parking_spots;

create policy "bldg_select_auth"
  on public.buildings for select to authenticated using (true);

create policy "bldg_select_anon"
  on public.buildings for select to anon using (true);

create policy "parking_select_auth"
  on public.parking_spots for select to authenticated using (true);

-- apartments: allow authenticated read (for RPC functions + direct access)
drop policy if exists "apt_select_auth_open" on public.apartments;
create policy "apt_select_auth_open"
  on public.apartments for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 6. Reload PostgREST schema cache
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';


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
