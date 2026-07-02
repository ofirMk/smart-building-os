-- =============================================================================
-- M5: Enterprise Property & Asset Management Module
--     Safe ALTER on Legacy Tables + Multi-Tenant RLS Rewrite
-- Migration: 20260919140000_erp_bldg_m5_alter_legacy_tables.sql
-- Depends on: M1–M4 (all previous migrations in this module)
--             erp_companies, erp_work_orders (M3), erp_md_suppliers (pre-existing)
--
-- SAFETY STRATEGY:
--   Every NOT NULL column is added in three atomic steps:
--     1. ADD COLUMN … NULL    (no constraint — existing rows unaffected)
--     2. UPDATE … SET …       (backfill existing rows with a safe default)
--     3. ALTER COLUMN … SET NOT NULL  (constraint added only after rows are valid)
--
--   The backfill uses the first company found in erp_companies (ordered by
--   created_at) as the safe default for any orphaned rows. In fresh deployments
--   (no production data yet) the UPDATE affects zero rows and is a no-op.
--
-- RLS REWRITE:
--   All five legacy anon policies (using(true)) are dropped and replaced with
--   strict, role-aware policies that enforce company_id isolation at the DB layer.
--   After this migration, NO unauthenticated access is permitted to these tables.
-- =============================================================================

-- ===========================================================================
-- TABLE 1: public.buildings
-- ===========================================================================

-- ─── Step 1: Add company_id as nullable (zero-downtime) ────────────────────

alter table public.buildings
  add column if not exists company_id text null
    references public.erp_companies(id) on delete restrict;

comment on column public.buildings.company_id is
  'Multi-tenant root: links this building to its managing ERP company. '
  'Added in M5; populated by backfill for existing rows.';

-- ─── Step 2: Backfill existing rows ────────────────────────────────────────
-- Uses the chronologically first company as the default owner.
-- If a building is already linked to a site (site_id → erp_sites.company_id),
-- that company is used preferentially for accurate ownership.

update public.buildings b
set company_id = coalesce(
  -- Prefer: derive from the site already attached to this building
  (select s.company_id from public.erp_sites s where s.id = b.site_id limit 1),
  -- Fallback: the earliest created ERP company (safe default for fresh installs)
  (select id from public.erp_companies order by created_at asc limit 1)
)
where b.company_id is null;

-- ─── Step 3: Enforce NOT NULL only after backfill is complete ──────────────

alter table public.buildings
  alter column company_id set not null;

create index if not exists buildings_company_idx
  on public.buildings (company_id);

-- ─── Drop all legacy anon policies on buildings ────────────────────────────

drop policy if exists "anon_select_buildings_dashboard" on public.buildings;

-- ─── New RLS policies for buildings ───────────────────────────────────────

-- SELECT ──────────────────────────────────────────────────────────────────

-- System admins and property managers of the company see all buildings
create policy "bldg_select_managers"
  on public.buildings for select to authenticated
  using (public.erp_can_manage_company(company_id));

-- Tenants see only the building(s) they occupy
create policy "bldg_select_tenants"
  on public.buildings for select to authenticated
  using (
    id in (select public.erp_tenant_building_ids())
  );

-- Subcontractors see buildings where they have an active work order assigned
create policy "bldg_select_subcontractors"
  on public.buildings for select to authenticated
  using (
    exists (
      select 1 from public.erp_work_orders wo
      where wo.building_id = buildings.id
        and public.erp_is_assigned_supplier(wo.assigned_to_supplier_id)
        and wo.status not in ('closed', 'cancelled')
    )
  );

-- INSERT / UPDATE ─────────────────────────────────────────────────────────

create policy "bldg_insert"
  on public.buildings for insert to authenticated
  with check (public.erp_can_manage_company(company_id));

create policy "bldg_update"
  on public.buildings for update to authenticated
  using   (public.erp_can_manage_company(company_id))
  with check (public.erp_can_manage_company(company_id));

-- DELETE ──────────────────────────────────────────────────────────────────
-- Only system admins may delete buildings (hard deletes are destructive —
-- prefer decommissioning via a status flag in the application layer)

create policy "bldg_delete"
  on public.buildings for delete to authenticated
  using (public.erp_is_system_admin());

grant select, insert, update, delete on public.buildings to authenticated;
grant all                            on public.buildings to service_role;

-- ===========================================================================
-- TABLE 2: public.apartments
-- All operations are wrapped in a DO block that checks the table exists.
-- On the remote DB, apartments may not be present if the initial schema was
-- applied via a non-migration path. The module works without it; IoT assets
-- can still attach at building/floor/zone level (unit_id remains nullable).
-- ===========================================================================

do $$
declare
  v_apartments_exist boolean;
begin
  select exists (
    select from pg_tables
    where schemaname = 'public' and tablename = 'apartments'
  ) into v_apartments_exist;

  if not v_apartments_exist then
    raise notice 'TABLE 2 SKIPPED: public.apartments does not exist on this database. '
                 'Columns, indexes and RLS for apartments will not be applied. '
                 'Run the initial schema migration first if apartments management is required.';
    return;
  end if;

  -- ─── Step 1: Add company_id as nullable ──────────────────────────────────
  alter table public.apartments
    add column if not exists company_id text null
      references public.erp_companies(id) on delete restrict;

  -- ─── Step 2: Backfill — derive from parent building ──────────────────────
  update public.apartments a
  set company_id = (
    select b.company_id
    from   public.buildings b
    where  b.id = a.building_id
    limit  1
  )
  where a.company_id is null;

  -- Safety net: fallback to first company for any still-unowned rows
  update public.apartments
  set company_id = (
    select id from public.erp_companies order by created_at asc limit 1
  )
  where company_id is null;

  -- ─── Step 3: Enforce NOT NULL ─────────────────────────────────────────────
  alter table public.apartments alter column company_id set not null;

  -- ─── Indexes ──────────────────────────────────────────────────────────────
  create index if not exists apartments_company_idx
    on public.apartments (company_id);

  create index if not exists apartments_tenant_building_idx
    on public.apartments (tenant_id, building_id)
    where tenant_id is not null;

  -- ─── Drop legacy anon policy ──────────────────────────────────────────────
  drop policy if exists "anon_select_apartments_dashboard" on public.apartments;

  -- ─── RLS Policies ─────────────────────────────────────────────────────────
  -- Managers
  create policy "apt_select_managers"
    on public.apartments for select to authenticated
    using (public.erp_can_manage_company(company_id));

  -- Tenants see their own unit
  create policy "apt_select_tenant_own"
    on public.apartments for select to authenticated
    using (tenant_id = auth.uid());

  -- Subcontractors see units with their assigned WO assets
  create policy "apt_select_subcontractors"
    on public.apartments for select to authenticated
    using (
      exists (
        select 1 from public.erp_work_orders wo
        where wo.asset_id in (
          select pa.id from public.erp_physical_assets pa
          where pa.unit_id = apartments.id
        )
        and public.erp_is_assigned_supplier(wo.assigned_to_supplier_id)
        and wo.status not in ('closed', 'cancelled')
      )
    );

  create policy "apt_insert"
    on public.apartments for insert to authenticated
    with check (public.erp_can_manage_company(company_id));

  create policy "apt_update"
    on public.apartments for update to authenticated
    using   (public.erp_can_manage_company(company_id))
    with check (public.erp_can_manage_company(company_id));

  create policy "apt_delete"
    on public.apartments for delete to authenticated
    using (public.erp_is_system_admin());

  grant select, insert, update, delete on public.apartments to authenticated;
  grant all                            on public.apartments to service_role;

  raise notice 'TABLE 2 COMPLETE: apartments upgraded with company_id and new RLS policies.';
end;
$$;

-- ===========================================================================
-- TABLE 3: public.tickets
-- Same defensive DO pattern as TABLE 2.
-- ===========================================================================

do $$
declare
  v_tickets_exist boolean;
begin
  select exists (
    select from pg_tables
    where schemaname = 'public' and tablename = 'tickets'
  ) into v_tickets_exist;

  if not v_tickets_exist then
    raise notice 'TABLE 3 SKIPPED: public.tickets does not exist on this database.';
    return;
  end if;

  -- ─── Add company_id ────────────────────────────────────────────────────────
  alter table public.tickets
    add column if not exists company_id text null
      references public.erp_companies(id) on delete restrict;

  -- ─── Backfill ─────────────────────────────────────────────────────────────
  update public.tickets t
  set company_id = (
    select b.company_id from public.buildings b
    where  b.id = t.building_id limit 1
  )
  where t.company_id is null;

  update public.tickets
  set company_id = (
    select id from public.erp_companies order by created_at asc limit 1
  )
  where company_id is null;

  alter table public.tickets alter column company_id set not null;

  create index if not exists tickets_company_idx on public.tickets (company_id);

  -- ─── work_order_id bridge ─────────────────────────────────────────────────
  alter table public.tickets
    add column if not exists work_order_id uuid null
      references public.erp_work_orders(id) on delete set null;

  create index if not exists tickets_work_order_idx
    on public.tickets (work_order_id)
    where work_order_id is not null;

  -- ─── Drop legacy anon policies ────────────────────────────────────────────
  drop policy if exists "anon_select_tickets_dashboard" on public.tickets;
  drop policy if exists "anon_update_tickets_dashboard" on public.tickets;
  drop policy if exists "anon_insert_tickets_dashboard" on public.tickets;

  -- ─── RLS Policies ─────────────────────────────────────────────────────────
  create policy "tkt_select_managers"
    on public.tickets for select to authenticated
    using (public.erp_can_manage_company(company_id));

  create policy "tkt_select_tenant_own"
    on public.tickets for select to authenticated
    using (created_by = auth.uid());

  create policy "tkt_select_subcontractors"
    on public.tickets for select to authenticated
    using (
      work_order_id is not null
      and public.erp_is_assigned_supplier(
        (select assigned_to_supplier_id from public.erp_work_orders
         where id = tickets.work_order_id)
      )
    );

  create policy "tkt_insert_authenticated"
    on public.tickets for insert to authenticated
    with check (
      company_id = (
        select b.company_id from public.buildings b
        where  b.id = building_id limit 1
      )
      and exists (
        select 1 from public.erp_user_company_roles
        where user_id    = auth.uid()
          and company_id = tickets.company_id
          and is_active  = true
      )
    );

  create policy "tkt_update_managers"
    on public.tickets for update to authenticated
    using   (public.erp_can_manage_company(company_id))
    with check (public.erp_can_manage_company(company_id));

  create policy "tkt_update_tenant_own"
    on public.tickets for update to authenticated
    using   (created_by = auth.uid() and status in ('open', 'in_progress'))
    with check (created_by = auth.uid());

  create policy "tkt_delete"
    on public.tickets for delete to authenticated
    using (public.erp_is_system_admin());

  grant select, insert, update, delete on public.tickets to authenticated;
  grant all                            on public.tickets to service_role;

  raise notice 'TABLE 3 COMPLETE: tickets upgraded with company_id, work_order_id bridge and new RLS policies.';
end;
$$;

-- ===========================================================================
-- SECTION 4 — Consistency Trigger: keep apartments.company_id in sync
--
-- If a building is reassigned to a different company (rare but possible),
-- all its child apartments must follow. This trigger maintains the denorm.
-- ===========================================================================

create or replace function public.erp_sync_building_company_to_children()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only run if company_id actually changed
  if new.company_id is distinct from old.company_id then
    -- Conditional updates: tables may not exist on all deployment targets
    if exists (select from pg_tables where schemaname='public' and tablename='apartments') then
      update public.apartments set company_id = new.company_id where building_id = new.id;
    end if;
    if exists (select from pg_tables where schemaname='public' and tablename='tickets') then
      update public.tickets set company_id = new.company_id where building_id = new.id;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.erp_sync_building_company_to_children() is
  'Cascades a building company_id change to all apartments and tickets '
  'belonging to it. Keeps denormalised company_id columns consistent.';

create trigger buildings_sync_company_to_children
  after update of company_id on public.buildings
  for each row execute function public.erp_sync_building_company_to_children();

-- ===========================================================================
-- SECTION 5 — Seed: erp_iot_rules default rules for new companies
--
-- A function that property managers can call to seed their company with a
-- sensible set of default IoT correlation rules. This avoids shipping rules
-- as static data (which would be shared across all tenants) while still
-- providing a good out-of-the-box experience.
-- ===========================================================================

create or replace function public.erp_seed_default_iot_rules(p_company_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Rule 1: Tailgating Detection (Smart Lock + Camera in same zone)
  insert into public.erp_iot_rules (
    company_id, rule_name, description, is_active,
    required_event_types, correlation_window_sec, required_asset_types,
    same_zone_required, action_type, wo_params, additional_actions, rule_priority
  ) values (
    p_company_id,
    'TAILGATE_SECURITY',
    'Detects tailgating: a camera reports a second person entering within 5 seconds of a single-badge door open.',
    true,
    ARRAY['door_open', 'tailgate_detected'],
    5,
    ARRAY['smart_lock', 'camera']::public.erp_asset_type[],
    true,
    'COMPOSITE',
    jsonb_build_object(
      'category',            'security_access',
      'priority',            'P1',
      'title_template',      '⚠️ Tailgating Detected – {zone_name}',
      'description_template','Tailgating event at {zone_name} on {timestamp}. Badge scan did not match occupancy count.'
    ),
    jsonb_build_array(
      jsonb_build_object('type', 'LOCK_NEXT_DOOR',  'asset_filter', 'zone_exit'),
      jsonb_build_object('type', 'PUSH_NOTIFY', 'target_role', 'subcontractor',
                         'supplier_category', 'security_access',
                         'message_template', '⚠️ Tailgating at {zone_name} – respond immediately'),
      jsonb_build_object('type', 'PUSH_NOTIFY', 'target_role', 'property_manager',
                         'message_template', '⚠️ Security alert: {zone_name}')
    ),
    10  -- Highest priority rule
  )
  on conflict do nothing;

  -- Rule 2: Forced Door / Tamper Detection
  insert into public.erp_iot_rules (
    company_id, rule_name, description, is_active,
    required_event_types, correlation_window_sec,
    same_zone_required, action_type, wo_params, additional_actions, rule_priority
  ) values (
    p_company_id,
    'DOOR_FORCED',
    'A door was opened without a valid badge scan (forced entry or tamper).',
    true,
    ARRAY['door_forced'],
    1,  -- Single-event rule; window irrelevant
    true,
    'COMPOSITE',
    jsonb_build_object(
      'category', 'security_access',
      'priority', 'P1',
      'title_template', '🚨 Forced Entry – {asset_name}',
      'description_template', 'Door {asset_name} was opened without a valid access credential on {timestamp}.'
    ),
    jsonb_build_array(
      jsonb_build_object('type', 'PUSH_NOTIFY', 'target_role', 'property_manager',
                         'message_template', '🚨 Forced entry: {asset_name}'),
      jsonb_build_object('type', 'PUSH_NOTIFY', 'target_role', 'subcontractor',
                         'supplier_category', 'security_access',
                         'message_template', '🚨 Respond: forced entry at {asset_name}')
    ),
    20
  )
  on conflict do nothing;

  -- Rule 3: Vibration Anomaly → Predictive Maintenance Work Order
  insert into public.erp_iot_rules (
    company_id, rule_name, description, is_active,
    required_event_types, correlation_window_sec,
    same_zone_required, action_type, wo_params, additional_actions, rule_priority
  ) values (
    p_company_id,
    'VIBRATION_MAINTENANCE',
    'Elevated vibration detected on a mechanical asset (pump, elevator, HVAC). Creates a predictive maintenance WO.',
    true,
    ARRAY['vibration_alert'],
    1,
    false,  -- Single-asset event; zone grouping not relevant
    'CREATE_WORK_ORDER',
    jsonb_build_object(
      'category', 'general',
      'priority', 'P2',
      'title_template', '🔧 Vibration Alert – {asset_name}',
      'description_template', 'Asset {asset_name} reported vibration outside baseline threshold on {timestamp}. Predictive maintenance inspection required.'
    ),
    '[]'::jsonb,
    50
  )
  on conflict do nothing;

end;
$$;

comment on function public.erp_seed_default_iot_rules(text) is
  'Seeds a new company with a sensible baseline set of IoT correlation rules. '
  'Call once during company onboarding. Existing rules are preserved (ON CONFLICT DO NOTHING).';
