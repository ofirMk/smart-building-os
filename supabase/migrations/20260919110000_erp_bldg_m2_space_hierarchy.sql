-- =============================================================================
-- M2: Enterprise Property & Asset Management Module
--     Space Hierarchy: Sites · Floors · Zones · Physical Assets
-- Migration: 20260919110000_erp_bldg_m2_space_hierarchy.sql
-- Depends on: M1 (20260919100000)
--             erp_companies, buildings, apartments (pre-existing)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SECTION 1 — erp_sites (מתחמים)
--
-- A Site groups multiple buildings under a single real-estate development
-- (e.g. "פרויקט השדרה - צפון" containing 4 towers).
-- Buildings are optionally linked to a site; standalone buildings are valid.
-- ---------------------------------------------------------------------------

create table public.erp_sites (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null references public.erp_companies(id) on delete restrict,
  name        text not null
    constraint erp_sites_name_nonempty check (length(trim(name)) > 0),

  -- Structured address. Shape:
  -- { "street": "...", "city": "...", "postal_code": "...", "lat": 31.77, "lng": 35.21 }
  address     jsonb not null default '{}'::jsonb,

  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.erp_sites is
  'Real-estate development / management zone that groups buildings under one '
  'management contract. An erp_company may have many sites across different cities.';

create index erp_sites_company_idx        on public.erp_sites (company_id);
create index erp_sites_company_active_idx on public.erp_sites (company_id, is_active);

create trigger erp_sites_updated_at
  before update on public.erp_sites
  for each row execute function public.set_updated_at();

-- RLS ──────────────────────────────────────────────────────────────────────

alter table public.erp_sites enable row level security;

create policy "erp_sites_select"
  on public.erp_sites for select to authenticated
  using (public.erp_can_manage_company(company_id));

create policy "erp_sites_insert"
  on public.erp_sites for insert to authenticated
  with check (public.erp_can_manage_company(company_id));

create policy "erp_sites_update"
  on public.erp_sites for update to authenticated
  using   (public.erp_can_manage_company(company_id))
  with check (public.erp_can_manage_company(company_id));

-- Only system admins hard-delete sites; prefer is_active = false
create policy "erp_sites_delete"
  on public.erp_sites for delete to authenticated
  using (public.erp_is_system_admin());

grant select, insert, update, delete on public.erp_sites to authenticated;
grant all                            on public.erp_sites to service_role;

-- ---------------------------------------------------------------------------
-- SECTION 2 — Attach buildings to sites (non-breaking ALTER)
--
-- Adds two columns to the existing buildings table:
--   • company_id – hooks the building into the multi-tenant ERP (added in M5)
--   • site_id    – optional grouping under an erp_site
--
-- NOTE: company_id NOT NULL + data backfill is handled in M5 (the dedicated
-- ALTER migration) so that existing records are patched safely before the
-- constraint fires.  Here we only add site_id as a nullable reference, which
-- is safe for existing rows.
-- ---------------------------------------------------------------------------

alter table public.buildings
  add column if not exists site_id uuid null
    references public.erp_sites(id) on delete set null;

create index if not exists buildings_site_id_idx
  on public.buildings (site_id)
  where site_id is not null;

comment on column public.buildings.site_id is
  'Optional grouping: links a building to its parent real-estate development '
  '(erp_sites). Null for standalone buildings not part of a named site.';

-- ---------------------------------------------------------------------------
-- SECTION 3 — erp_floors (קומות)
--
-- Intermediate level between a building and its zones/units.
-- floor_number can be negative (underground parking, plant rooms).
-- ---------------------------------------------------------------------------

create table public.erp_floors (
  id             uuid    primary key default gen_random_uuid(),
  company_id     text    not null references public.erp_companies(id) on delete restrict,
  building_id    uuid    not null references public.buildings(id) on delete cascade,
  floor_number   integer not null,
  -- Optional friendly label ("מרתף -1", "גג טכני", "לובי")
  name           text    null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Two floors with the same number in the same building is a data error
  constraint erp_floors_unique_per_building unique (building_id, floor_number)
);

comment on table public.erp_floors is
  'Floor record within a building. Negative floor_number = underground level. '
  'Enables precise asset placement (e.g. pump on floor -2) and zone grouping.';

comment on column public.erp_floors.floor_number is
  'Physical floor index: 0 = ground, positive = above ground, negative = below.';

create index erp_floors_building_idx on public.erp_floors (building_id);
create index erp_floors_company_idx  on public.erp_floors (company_id);

create trigger erp_floors_updated_at
  before update on public.erp_floors
  for each row execute function public.set_updated_at();

-- Add floor linkage to apartments (non-breaking: nullable)
-- Defensive: apartments may not exist on the remote DB if the initial schema
-- was applied via a different mechanism. The DO block is a no-op on databases
-- that already have the column; it silently skips on databases without the table.
do $$
begin
  if exists (
    select from pg_tables
    where schemaname = 'public' and tablename = 'apartments'
  ) then
    alter table public.apartments
      add column if not exists floor_id uuid null
        references public.erp_floors(id) on delete set null;

    comment on column public.apartments.floor_id is
      'Link to erp_floors. Complements the existing integer floor column. '
      'The integer column is kept for backward compatibility; floor_id is the '
      'authoritative FK once floors are provisioned.';

    create index if not exists apartments_floor_id_idx
      on public.apartments (floor_id)
      where floor_id is not null;
  end if;
end;
$$;

-- RLS ──────────────────────────────────────────────────────────────────────

alter table public.erp_floors enable row level security;

-- Managers see all floors in their company's buildings.
-- Tenants see floors belonging to their own building.
create policy "erp_floors_select"
  on public.erp_floors for select to authenticated
  using (
    public.erp_can_manage_company(company_id)
    or building_id in (select public.erp_tenant_building_ids())
  );

create policy "erp_floors_write"
  on public.erp_floors for all to authenticated
  using   (public.erp_can_manage_company(company_id))
  with check (public.erp_can_manage_company(company_id));

grant select, insert, update, delete on public.erp_floors to authenticated;
grant all                            on public.erp_floors to service_role;

-- ---------------------------------------------------------------------------
-- SECTION 4 — erp_zones (אזורים משותפים)
--
-- Named common areas within a floor: lobby, utility room, parking section.
-- Each zone can host multiple physical assets (cameras, pumps, sensors).
-- ---------------------------------------------------------------------------

create table public.erp_zones (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null references public.erp_companies(id) on delete restrict,
  floor_id    uuid not null references public.erp_floors(id)    on delete cascade,
  name        text not null
    constraint erp_zones_name_nonempty check (length(trim(name)) > 0),
  zone_type   public.erp_zone_type not null default 'other',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.erp_zones is
  'Named common-area within a floor. Examples: "חדר שנאים קומה 3", '
  '"חניון B – שורה 5", "גג טכני – צד מזרח".';

create index erp_zones_floor_idx   on public.erp_zones (floor_id);
create index erp_zones_company_idx on public.erp_zones (company_id);
create index erp_zones_type_idx    on public.erp_zones (zone_type);

create trigger erp_zones_updated_at
  before update on public.erp_zones
  for each row execute function public.set_updated_at();

-- RLS ──────────────────────────────────────────────────────────────────────

alter table public.erp_zones enable row level security;

create policy "erp_zones_select"
  on public.erp_zones for select to authenticated
  using (public.erp_can_manage_company(company_id));

create policy "erp_zones_write"
  on public.erp_zones for all to authenticated
  using   (public.erp_can_manage_company(company_id))
  with check (public.erp_can_manage_company(company_id));

grant select, insert, update, delete on public.erp_zones to authenticated;
grant all                            on public.erp_zones to service_role;

-- ---------------------------------------------------------------------------
-- SECTION 5 — erp_physical_assets (נכסים פיזיים)
--
-- Every trackable physical component in the property hierarchy.
-- Examples: elevator motor, main water pump, smart lock on apartment 4B,
--           corridor camera on floor 3, electrical panel in utility room.
--
-- POLYMORPHIC LOCATION MODEL:
--   The asset declares its location_level and then populates exactly ONE of
--   the four location FKs (building_id | floor_id | zone_id | unit_id).
--   DB CHECK constraints enforce this rule at the storage layer.
--
-- IoT READINESS:
--   hardware_meta (JSONB) stores all device-level identifiers needed for
--   future webhook registration. The schema is intentionally flexible to
--   accommodate different hardware vendors (Verkada, Salto, ButterflyMX…).
-- ---------------------------------------------------------------------------

create table public.erp_physical_assets (
  id                   uuid primary key default gen_random_uuid(),
  company_id           text not null references public.erp_companies(id) on delete restrict,
  asset_type           public.erp_asset_type   not null,
  name                 text not null
    constraint erp_pa_name_nonempty check (length(trim(name)) > 0),

  -- ── Physical Identification ──────────────────────────────────────────────
  serial_number        text null,
  model                text null,
  manufacturer         text null,
  install_date         date null,
  warranty_expiry_date date null,

  -- ── IoT / Hardware Metadata ──────────────────────────────────────────────
  -- Stores vendor-specific device identifiers and sensor baselines.
  -- Remains '{}' until a smart device is provisioned for this asset.
  --
  -- Recommended shape:
  -- {
  --   "mac":                   "aa:bb:cc:dd:ee:ff",
  --   "gateway_id":            "gw-lobby-floor3-001",
  --   "provider":              "verkada",        -- verkada | salto | butterflymx | custom
  --   "webhook_topic":         "door_open",
  --   "baseline_vibration_hz": 50,               -- Vibration analysis baseline
  --   "alert_threshold_pct":   15,               -- % deviation before alert fires
  --   "firmware_version":      "4.2.1",
  --   "last_firmware_check_at":"2026-09-01T00:00:00Z"
  -- }
  hardware_meta        jsonb not null default '{}'::jsonb,

  -- ── Polymorphic Location ─────────────────────────────────────────────────
  -- Exactly ONE location FK must be non-null; which one is governed by
  -- location_level and enforced by the four CHECK constraints below.
  location_level  public.erp_location_level not null,
  building_id     uuid null references public.buildings(id)    on delete restrict,
  floor_id        uuid null references public.erp_floors(id)   on delete restrict,
  zone_id         uuid null references public.erp_zones(id)    on delete restrict,
  -- unit_id FK to apartments added conditionally below (apartments may not exist
  -- on all deployment targets — FK is enforced via a DO block after CREATE TABLE)
  unit_id         uuid null,

  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- ── Polymorphic Integrity Constraints ────────────────────────────────────
  -- Each constraint verifies: if this is the declared level, then the right FK
  -- is populated and all others are null.
  constraint erp_pa_location_building_chk check (
    location_level <> 'building'
    or (building_id is not null and floor_id is null and zone_id is null and unit_id is null)
  ),
  constraint erp_pa_location_floor_chk check (
    location_level <> 'floor'
    or (floor_id is not null and building_id is null and zone_id is null and unit_id is null)
  ),
  constraint erp_pa_location_zone_chk check (
    location_level <> 'zone'
    or (zone_id is not null and building_id is null and floor_id is null and unit_id is null)
  ),
  constraint erp_pa_location_unit_chk check (
    location_level <> 'unit'
    or (unit_id is not null and building_id is null and floor_id is null and zone_id is null)
  )
);

comment on table public.erp_physical_assets is
  'Trackable physical equipment at any level of the property hierarchy. '
  'Use hardware_meta to store IoT identifiers; the field is ready for smart-device '
  'webhook registration without requiring a schema change.';

comment on column public.erp_physical_assets.hardware_meta is
  'Vendor-specific device metadata (MAC, gateway ID, webhook topic, sensor '
  'baselines). Empty ({}) until a smart device is provisioned for this asset. '
  'GIN-indexed to support queries like: find all Verkada devices in building X.';

comment on column public.erp_physical_assets.location_level is
  'Declares which FK is active. CHECK constraints enforce exactly-one-non-null.';

-- Standard lookup indexes
create index erp_pa_company_idx      on public.erp_physical_assets (company_id);
create index erp_pa_type_idx         on public.erp_physical_assets (asset_type);
create index erp_pa_active_idx       on public.erp_physical_assets (is_active);

-- Partial indexes — only carry cost when the column is actually populated
create index erp_pa_building_idx
  on public.erp_physical_assets (building_id) where building_id is not null;
create index erp_pa_floor_idx
  on public.erp_physical_assets (floor_id)   where floor_id   is not null;
create index erp_pa_zone_idx
  on public.erp_physical_assets (zone_id)    where zone_id    is not null;
create index erp_pa_unit_idx
  on public.erp_physical_assets (unit_id)    where unit_id    is not null;

-- Add FK to apartments only if that table exists on this deployment target.
-- If apartments is missing, unit_id remains a plain UUID. The constraint can
-- be added later via ALTER TABLE once apartments is provisioned.
do $$
begin
  if exists (
    select from pg_tables
    where schemaname = 'public' and tablename = 'apartments'
  ) then
    alter table public.erp_physical_assets
      add constraint erp_pa_unit_fk
        foreign key (unit_id)
        references public.apartments(id)
        on delete restrict;
    raise notice 'erp_physical_assets.unit_id FK to apartments applied.';
  else
    raise notice 'erp_physical_assets.unit_id FK skipped — apartments does not exist yet. '
                 'Add the constraint manually after apartments is created.';
  end if;
end;
$$;

-- GIN index enables hardware_meta JSON queries (e.g. find by MAC or gateway_id)
create index erp_pa_hardware_meta_gin
  on public.erp_physical_assets using gin (hardware_meta);

create trigger erp_pa_updated_at
  before update on public.erp_physical_assets
  for each row execute function public.set_updated_at();

-- RLS ──────────────────────────────────────────────────────────────────────

alter table public.erp_physical_assets enable row level security;

-- Property managers: full access to all assets in their company.
create policy "erp_pa_select_managers"
  on public.erp_physical_assets for select to authenticated
  using (public.erp_can_manage_company(company_id));

-- Subcontractor visibility is added in M3 (after erp_work_orders exists
-- and we can reference it without a forward-reference error).
-- Intentional: subcontractors currently see no assets until M3 is applied.

create policy "erp_pa_write"
  on public.erp_physical_assets for all to authenticated
  using   (public.erp_can_manage_company(company_id))
  with check (public.erp_can_manage_company(company_id));

grant select, insert, update, delete on public.erp_physical_assets to authenticated;
grant all                            on public.erp_physical_assets to service_role;
