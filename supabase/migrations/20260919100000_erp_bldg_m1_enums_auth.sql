-- =============================================================================
-- M1: Enterprise Property & Asset Management Module
--     ENUMs · Auth Bridge · RLS Helper Functions
-- Migration: 20260919100000_erp_bldg_m1_enums_auth.sql
-- Depends on: erp_companies, erp_md_suppliers, profiles (all pre-existing)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SECTION 1 — ENUMS
-- All types are prefixed erp_ to namespace them cleanly inside the ERP domain.
-- ---------------------------------------------------------------------------

-- Physical asset type (the kind of equipment being tracked)
create type public.erp_asset_type as enum (
  'elevator',
  'pump',
  'smart_lock',
  'camera',
  'hvac_unit',
  'electrical_panel',
  'generator',
  'water_meter',
  'fire_system',
  'intercom',
  'barrier_gate',
  'other'
);

-- Operational status of a Work Order through its lifecycle
create type public.erp_wo_status as enum (
  'open',               -- Created, not yet assigned to a supplier
  'assigned',           -- Supplier notified, work not yet started
  'in_progress',        -- Supplier has checked in / work underway
  'pending_verification', -- Supplier closed it; awaiting confirmation
  'closed',             -- Fully verified and complete
  'cancelled'           -- Voided (with reason tracked in description)
);

-- Origin of a Work Order — critical for CMMS analytics
create type public.erp_trigger_source as enum (
  'human',              -- Property manager or tenant initiated
  'system_automated',   -- Preventive maintenance plan scheduler
  'iot_sensor'          -- Smart device / webhook event
);

-- Trade / service category of a Work Order
create type public.erp_wo_category as enum (
  'electrical',
  'plumbing',
  'hvac',
  'security_access',    -- Smart locks, access control, CCTV
  'structural',
  'cleaning',
  'elevator',
  'iot_device',         -- Sensor or smart-device failure
  'general',
  'other'
);

-- Preventive maintenance recurrence schedule
create type public.erp_preventive_frequency as enum (
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'semi_annual',
  'annual'
);

-- Common-area zone classification
create type public.erp_zone_type as enum (
  'lobby',
  'corridor',
  'parking',
  'roof',
  'utility_room',
  'storage',
  'stairwell',
  'elevator_shaft',
  'gym',
  'pool_area',
  'other'
);

-- Which level of the property hierarchy a physical asset is attached to
create type public.erp_location_level as enum (
  'building',   -- Building-wide asset (e.g. main generator)
  'floor',      -- Floor asset (e.g. corridor camera)
  'zone',       -- Zone asset (e.g. pump room sensor)
  'unit'        -- Unit asset (e.g. in-apartment smart lock)
);

-- How a Work Order closure was verified
create type public.erp_verification_method as enum (
  'tenant_feedback',  -- Tenant confirmed via app
  'gps_checkin',      -- Supplier GPS location confirmed on site
  'sensor_restore',   -- IoT sensor returned to normal baseline
  'manual_admin'      -- Property manager manually approved
);

-- Verification resolution state
create type public.erp_verification_status as enum (
  'pending',
  'verified',
  'disputed'
);

-- ---------------------------------------------------------------------------
-- SECTION 2 — WORK ORDER NUMBER SEQUENCE
-- Generates human-readable WO numbers: WO-2026-00042
-- ---------------------------------------------------------------------------

create sequence public.erp_wo_number_seq
  start with 1
  increment by 1
  no minvalue
  no maxvalue
  cache 1;

-- ---------------------------------------------------------------------------
-- SECTION 3 — MULTI-TENANT AUTH BRIDGE  (erp_user_company_roles)
--
-- Problem this solves:
--   • profiles.role uses the existing user_role enum ('admin','property_manager',
--     'tenant','contractor'). We cannot alter that enum non-destructively.
--   • The new module needs a 'subcontractor' role and N:M user ↔ company mapping.
--   • This table bridges auth identity to ERP company membership WITHOUT touching
--     the existing profiles or user_role enum.
-- ---------------------------------------------------------------------------

create table public.erp_user_company_roles (
  user_id     uuid   not null references public.profiles(id)      on delete cascade,
  company_id  text   not null references public.erp_companies(id)  on delete cascade,

  -- Role within this specific company (independent of profiles.role)
  role        text   not null
    constraint erp_ucr_role_chk check (
      role in ('admin', 'property_manager', 'tenant', 'subcontractor')
    ),

  -- Required when role = 'subcontractor'; links to their ERP supplier card
  supplier_id uuid   null
    references public.erp_md_suppliers(id) on delete set null,

  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint erp_ucr_pk primary key (user_id, company_id),

  -- Subcontractors MUST be tied to a supplier record so RLS can resolve them
  constraint erp_ucr_subcontractor_needs_supplier_chk check (
    role <> 'subcontractor' or supplier_id is not null
  )
);

comment on table public.erp_user_company_roles is
  'Multi-tenant bridge: maps auth profiles → ERP companies with explicit roles. '
  'A user may appear in multiple companies. ''subcontractor'' rows must reference '
  'their erp_md_suppliers card so RLS can scope their work-order visibility.';

comment on column public.erp_user_company_roles.supplier_id is
  'Non-null for subcontractor role. Used by RLS to grant access only to work '
  'orders assigned to this supplier.';

create index erp_ucr_company_idx
  on public.erp_user_company_roles (company_id);

create index erp_ucr_supplier_idx
  on public.erp_user_company_roles (supplier_id)
  where supplier_id is not null;

create index erp_ucr_role_active_idx
  on public.erp_user_company_roles (role, is_active);

create trigger erp_ucr_updated_at
  before update on public.erp_user_company_roles
  for each row execute function public.set_updated_at();

-- RLS
alter table public.erp_user_company_roles enable row level security;

-- Users can read their own rows; admins see all
create policy "erp_ucr_select"
  on public.erp_user_company_roles for select to authenticated
  using (
    user_id = auth.uid()
    or (select role from public.profiles where id = auth.uid()) = 'admin'
  );

-- Only system admins may manage company membership
create policy "erp_ucr_admin_all"
  on public.erp_user_company_roles for all to authenticated
  using   ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

grant select, insert, update, delete on public.erp_user_company_roles to authenticated;
grant all                            on public.erp_user_company_roles to service_role;

-- ---------------------------------------------------------------------------
-- SECTION 4 — RLS HELPER FUNCTIONS
--
-- security definer: runs with definer privileges so callers cannot alter
-- search_path to escalate permissions.  All functions are stable (no writes).
-- ---------------------------------------------------------------------------

-- Returns true if the current user is a system-level admin (profiles.role).
create or replace function public.erp_is_system_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

comment on function public.erp_is_system_admin() is
  'RLS helper: true if the current user has profiles.role = ''admin''.';

-- ---------------------------------------------------------------------------
-- Returns true if the current user can manage (read + write) data belonging to
-- the given company, either as a system admin or as a property_manager/admin
-- role within that company.
-- Used in SELECT/INSERT/UPDATE policies on all company-scoped tables.
-- ---------------------------------------------------------------------------
create or replace function public.erp_can_manage_company(p_company_id text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    public.erp_is_system_admin()
    or exists (
      select 1 from public.erp_user_company_roles
      where user_id   = auth.uid()
        and company_id = p_company_id
        and role       in ('property_manager', 'admin')
        and is_active  = true
    );
$$;

comment on function public.erp_can_manage_company(text) is
  'RLS helper: true if the current user is a system admin OR holds a '
  'property_manager/admin role inside the given company.';

-- ---------------------------------------------------------------------------
-- Returns true if the current user is an active subcontractor whose supplier
-- record matches the given supplier_id.
-- Used in SELECT policies on erp_work_orders and erp_physical_assets.
-- ---------------------------------------------------------------------------
create or replace function public.erp_is_assigned_supplier(p_supplier_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select p_supplier_id is not null
    and exists (
      select 1 from public.erp_user_company_roles
      where user_id     = auth.uid()
        and supplier_id = p_supplier_id
        and role        = 'subcontractor'
        and is_active   = true
    );
$$;

comment on function public.erp_is_assigned_supplier(uuid) is
  'RLS helper: true if the current user is a subcontractor linked to the '
  'given supplier_id in erp_user_company_roles.';

-- ---------------------------------------------------------------------------
-- Returns the building_id(s) the current tenant is assigned to, used to
-- scope tenant read access on building-level resources.
--
-- NOTE: uses language plpgsql (not sql) intentionally.
--   SQL functions are validated at CREATE time — if apartments does not yet
--   exist in the DB state when this migration runs, a sql function would fail.
--   plpgsql defers body compilation to the first call, which is always safe
--   because apartments is guaranteed to exist before any tenant uses the system.
-- ---------------------------------------------------------------------------
create or replace function public.erp_tenant_building_ids()
returns setof uuid
language plpgsql stable security definer
set search_path = public
as $$
begin
  return query
  select distinct building_id
  from   public.apartments
  where  tenant_id = auth.uid();
end;
$$;

comment on function public.erp_tenant_building_ids() is
  'RLS helper: returns the set of building_ids the current tenant occupies. '
  'Uses plpgsql to defer table-reference validation to call time.';
