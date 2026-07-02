-- =============================================================================
-- M3: Enterprise Property & Asset Management Module
--     CMMS Core: SLA Contracts · Work Orders · Preventive Plans
-- Migration: 20260919120000_erp_bldg_m3_cmms_core.sql
-- Depends on: M1 (enums, helpers), M2 (erp_physical_assets, erp_floors, erp_zones)
--             erp_md_suppliers, erp_purchase_orders, buildings, tickets (pre-existing)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SECTION 1 — erp_sla_contracts (הסכמי רמת שירות)
--
-- Defines the agreed response and resolution time for a given supplier,
-- work category and priority level. Drives automatic SLA deadline calculation
-- on every new Work Order and the penalty calculation at invoice time.
--
-- Created before erp_work_orders so its FK can be referenced there.
-- ---------------------------------------------------------------------------

create table public.erp_sla_contracts (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null references public.erp_companies(id)     on delete restrict,
  supplier_id uuid not null references public.erp_md_suppliers(id)  on delete restrict,

  -- Optional: contract applies to a specific building; null = company-wide
  building_id uuid null references public.buildings(id) on delete cascade,

  category    public.erp_wo_category  not null,
  priority    public.ticket_priority  not null,   -- Reuses existing P1-P4 enum

  -- Time budgets (integer hours to keep arithmetic simple in RPC calls)
  response_hours   integer not null constraint erp_sla_response_positive   check (response_hours   > 0),
  resolution_hours integer not null constraint erp_sla_resolution_positive check (resolution_hours > 0),
  constraint erp_sla_resolution_after_response check (resolution_hours >= response_hours),

  -- Financial penalty per SLA breach event (in company's base currency)
  penalty_amount_per_breach numeric(12,2) not null default 0
    constraint erp_sla_penalty_nonneg check (penalty_amount_per_breach >= 0),

  -- Maximum penalty deductible from a single invoice (e.g. 10% of invoice total)
  penalty_cap_percent numeric(5,2) not null default 10
    constraint erp_sla_cap_range check (penalty_cap_percent between 0 and 100),

  is_active   boolean not null default true,
  valid_from  date    not null default current_date,
  valid_until date    null,
  constraint erp_sla_valid_range check (valid_until is null or valid_until > valid_from),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- One active rule per (supplier, building-or-null, category, priority) tuple
  constraint erp_sla_unique_rule
    unique nulls not distinct (company_id, supplier_id, building_id, category, priority)
);

comment on table public.erp_sla_contracts is
  'SLA rules per supplier/category/priority combination. When a Work Order is '
  'created, the system queries this table to calculate sla_response_due_at and '
  'sla_resolution_due_at. Breaches auto-deduct from the supplier''s invoice.';

comment on column public.erp_sla_contracts.building_id is
  'Null = company-wide rule; non-null = rule overrides for this specific building. '
  'The most specific matching rule (building-level) wins at lookup time.';

create index erp_sla_supplier_idx     on public.erp_sla_contracts (supplier_id);
create index erp_sla_company_idx      on public.erp_sla_contracts (company_id);
create index erp_sla_building_idx     on public.erp_sla_contracts (building_id) where building_id is not null;
create index erp_sla_lookup_idx       on public.erp_sla_contracts (company_id, supplier_id, category, priority, is_active);

create trigger erp_sla_updated_at
  before update on public.erp_sla_contracts
  for each row execute function public.set_updated_at();

-- RLS ──────────────────────────────────────────────────────────────────────

alter table public.erp_sla_contracts enable row level security;

create policy "erp_sla_select"
  on public.erp_sla_contracts for select to authenticated
  using (public.erp_can_manage_company(company_id));

create policy "erp_sla_write"
  on public.erp_sla_contracts for all to authenticated
  using   (public.erp_can_manage_company(company_id))
  with check (public.erp_can_manage_company(company_id));

grant select, insert, update, delete on public.erp_sla_contracts to authenticated;
grant all                            on public.erp_sla_contracts to service_role;

-- ---------------------------------------------------------------------------
-- SECTION 2 — erp_work_orders (פקודות עבודה — CMMS Core)
--
-- The central operational record of the CMMS module.
-- A Work Order is the single unit of field work: assignment, tracking,
-- verification, SLA measurement and financial settlement.
--
-- THREE CREATION PATHS (trigger_source):
--   1. human          → A property_manager escalates a tenant ticket, or opens
--                        a WO directly (sla sourced from erp_sla_contracts)
--   2. system_automated → An erp_preventive_plan fires and creates a WO on
--                        schedule (source_preventive_plan_id is set)
--   3. iot_sensor     → An erp_iot_event (webhook) is processed by the
--                        rules engine and creates a WO automatically
--                        (source_iot_event_id added as a plain uuid here;
--                         FK constraint to erp_iot_events is added in M4)
--
-- FINANCIAL SETTLEMENT BRIDGE:
--   purchase_order_id links to erp_purchase_orders when the work generates a
--   procurement need (e.g. spare part ordered automatically from inventory).
-- ---------------------------------------------------------------------------

create table public.erp_work_orders (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null references public.erp_companies(id) on delete restrict,

  -- Human-readable identifier set by trigger before insert
  wo_number   text not null default '',

  title       text not null constraint erp_wo_title_nonempty check (length(trim(title)) > 0),
  description text null,
  category    public.erp_wo_category  not null,
  priority    public.ticket_priority  not null default 'P3',  -- Reuses existing enum
  status      public.erp_wo_status    not null default 'open',

  -- ── Origin ──────────────────────────────────────────────────────────────
  trigger_source  public.erp_trigger_source not null,

  -- Exactly one of these should be set, matching trigger_source:
  -- source_ticket_id FK to tickets added conditionally below (tickets may not
  -- exist on all deployment targets — FK enforced via DO block after CREATE TABLE)
  source_ticket_id           uuid null,
  source_preventive_plan_id  uuid null,  -- FK to erp_preventive_plans; added after that table is created below
  source_iot_event_id        uuid null,  -- FK to erp_iot_events; constraint added in M4

  -- ── Subject ─────────────────────────────────────────────────────────────
  -- building_id is always required; asset_id is set when work targets specific equipment
  building_id  uuid not null references public.buildings(id) on delete restrict,
  asset_id     uuid null     references public.erp_physical_assets(id) on delete set null,

  -- ── Assignment ──────────────────────────────────────────────────────────
  assigned_to_supplier_id uuid null references public.erp_md_suppliers(id) on delete set null,
  assigned_at             timestamptz null,  -- Stamped when status moves to 'assigned'

  -- ── SLA Tracking ────────────────────────────────────────────────────────
  -- Populated on creation by the SLA lookup RPC (from erp_sla_contracts)
  sla_response_due_at    timestamptz null,
  sla_resolution_due_at  timestamptz null,
  sla_breached           boolean not null default false,
  -- Financial penalty calculated at close time (from erp_sla_contracts rule)
  sla_penalty_amount     numeric(12,2) null
    constraint erp_wo_penalty_nonneg check (sla_penalty_amount is null or sla_penalty_amount >= 0),

  -- ── Execution Timeline ───────────────────────────────────────────────────
  actual_start_at  timestamptz null,
  closed_at        timestamptz null,

  -- ── Closure Verification ─────────────────────────────────────────────────
  -- Prevents false "done" reports; closure requires evidence before confirmed
  verification_method  public.erp_verification_method null,
  verification_status  public.erp_verification_status not null default 'pending',
  before_photo_url     text null,
  after_photo_url      text null,
  -- GPS coordinates submitted by the subcontractor on check-in
  checkin_lat          numeric(9,6) null,
  checkin_lng          numeric(9,6) null,
  checkin_at           timestamptz  null,

  -- ── Financial Bridge ─────────────────────────────────────────────────────
  -- Set when the WO triggers an auto-purchase-order (e.g. spare part needed)
  purchase_order_id  uuid null references public.erp_purchase_orders(id) on delete set null,

  created_by  uuid not null references public.profiles(id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- A WO sourced from a ticket must reference that ticket
  constraint erp_wo_human_needs_ticket_chk check (
    trigger_source <> 'human' or source_ticket_id is not null or source_preventive_plan_id is not null
  ),

  -- Closed WOs must have a closed_at timestamp
  constraint erp_wo_closed_timestamp_chk check (
    status not in ('closed', 'cancelled') or closed_at is not null
  )
);

comment on table public.erp_work_orders is
  'Central CMMS operational record. Created by three paths: human escalation, '
  'IoT event, or preventive plan. Tracks SLA compliance, GPS verification, and '
  'links to procurement when a spare part purchase is needed.';

comment on column public.erp_work_orders.wo_number is
  'Human-readable number (WO-YYYY-NNNNN). Set by erp_wo_set_number trigger.';

comment on column public.erp_work_orders.source_iot_event_id is
  'UUID of the erp_iot_event that triggered this WO. FK constraint is added in '
  'M4 once that table exists (ALTER TABLE ... ADD CONSTRAINT).';

comment on column public.erp_work_orders.verification_status is
  'pending: waiting for evidence. verified: confirmed closed. disputed: '
  'supplier claimed done but evidence does not match.';

-- Indexes ──────────────────────────────────────────────────────────────────

create index erp_wo_company_idx       on public.erp_work_orders (company_id);
create index erp_wo_building_idx      on public.erp_work_orders (building_id);
create index erp_wo_status_idx        on public.erp_work_orders (status);
create index erp_wo_supplier_idx      on public.erp_work_orders (assigned_to_supplier_id)
  where assigned_to_supplier_id is not null;
create index erp_wo_asset_idx         on public.erp_work_orders (asset_id)
  where asset_id is not null;
create index erp_wo_sla_due_idx       on public.erp_work_orders (sla_resolution_due_at)
  where status not in ('closed', 'cancelled');
create index erp_wo_trigger_idx       on public.erp_work_orders (trigger_source);
create index erp_wo_ticket_src_idx    on public.erp_work_orders (source_ticket_id)
  where source_ticket_id is not null;

-- Add FK to tickets only if that table exists on this deployment target
do $$
begin
  if exists (
    select from pg_tables
    where schemaname = 'public' and tablename = 'tickets'
  ) then
    alter table public.erp_work_orders
      add constraint erp_wo_ticket_fk
        foreign key (source_ticket_id)
        references public.tickets(id)
        on delete set null;
    raise notice 'erp_work_orders.source_ticket_id FK to tickets applied.';
  else
    raise notice 'erp_work_orders.source_ticket_id FK skipped — tickets does not exist yet.';
  end if;
end;
$$;
create index erp_wo_verification_idx  on public.erp_work_orders (verification_status)
  where status = 'pending_verification';

-- Trigger: auto-generate wo_number before insert ───────────────────────────

create or replace function public.erp_wo_set_number()
returns trigger
language plpgsql
as $$
begin
  new.wo_number := 'WO-'
    || to_char(now(), 'YYYY')
    || '-'
    || lpad(nextval('public.erp_wo_number_seq')::text, 5, '0');
  return new;
end;
$$;

comment on function public.erp_wo_set_number() is
  'Assigns a human-readable WO number (WO-YYYY-NNNNN) before each insert '
  'using the erp_wo_number_seq sequence.';

create trigger erp_wo_number_trigger
  before insert on public.erp_work_orders
  for each row execute function public.erp_wo_set_number();

-- Trigger: stamp assigned_at when status moves to 'assigned' ───────────────

create or replace function public.erp_wo_stamp_assigned()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'assigned' and (old.status is null or old.status <> 'assigned') then
    new.assigned_at := now();
  end if;
  if new.status in ('closed', 'cancelled') and new.closed_at is null then
    new.closed_at := now();
  end if;
  return new;
end;
$$;

create trigger erp_wo_stamp_assigned_trigger
  before update on public.erp_work_orders
  for each row execute function public.erp_wo_stamp_assigned();

create trigger erp_wo_updated_at
  before update on public.erp_work_orders
  for each row execute function public.set_updated_at();

-- RLS ──────────────────────────────────────────────────────────────────────

alter table public.erp_work_orders enable row level security;

-- Property managers see all WOs in their company
create policy "erp_wo_select_managers"
  on public.erp_work_orders for select to authenticated
  using (public.erp_can_manage_company(company_id));

-- Subcontractors see only WOs assigned to their supplier
create policy "erp_wo_select_subcontractors"
  on public.erp_work_orders for select to authenticated
  using (public.erp_is_assigned_supplier(assigned_to_supplier_id));

-- Tenants see WOs for their building(s) — read-only, no sensitive financial data
-- (Application layer should project only non-financial columns for this role)
create policy "erp_wo_select_tenants"
  on public.erp_work_orders for select to authenticated
  using (building_id in (select public.erp_tenant_building_ids()));

-- Only managers create/update/delete WOs
create policy "erp_wo_manager_write"
  on public.erp_work_orders for all to authenticated
  using   (public.erp_can_manage_company(company_id))
  with check (public.erp_can_manage_company(company_id));

-- Subcontractors may update only their own assigned WOs (e.g. upload photos,
-- mark in_progress, submit for verification). Status transitions are validated
-- at the API/application layer.
create policy "erp_wo_subcontractor_update"
  on public.erp_work_orders for update to authenticated
  using   (public.erp_is_assigned_supplier(assigned_to_supplier_id))
  with check (public.erp_is_assigned_supplier(assigned_to_supplier_id));

grant select, insert, update, delete on public.erp_work_orders to authenticated;
grant all                            on public.erp_work_orders to service_role;

-- Now that erp_work_orders exists, add FK from source_preventive_plan_id
-- (erp_preventive_plans is created in Section 3 of this same migration;
--  the deferred constraint is added at the end of this file).

-- ---------------------------------------------------------------------------
-- SECTION 3 — Now add self-referencing FK for physical assets → work orders
--             (subcontractor can now see assets linked to their WOs)
-- ---------------------------------------------------------------------------

-- Subcontractor asset visibility: they may view assets linked to their WOs
create policy "erp_pa_select_subcontractors"
  on public.erp_physical_assets for select to authenticated
  using (
    exists (
      select 1 from public.erp_work_orders wo
      where wo.asset_id = erp_physical_assets.id
        and public.erp_is_assigned_supplier(wo.assigned_to_supplier_id)
    )
  );

-- ---------------------------------------------------------------------------
-- SECTION 4 — erp_preventive_plans (תכניות תחזוקה מונעת)
--
-- Replaces the legacy preventive_tasks table (abandoned scaffold, no live data).
-- Each plan describes a recurring maintenance job and auto-generates a Work
-- Order when next_due_date is reached (via pg_cron or a scheduled API call).
-- ---------------------------------------------------------------------------

create table public.erp_preventive_plans (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null references public.erp_companies(id) on delete restrict,
  name        text not null
    constraint erp_prev_name_nonempty check (length(trim(name)) > 0),
  description text null,

  -- Subject: one of asset_id or building_id must be set
  asset_id     uuid null references public.erp_physical_assets(id) on delete cascade,
  building_id  uuid null references public.buildings(id)           on delete cascade,
  constraint erp_prev_subject_chk check (
    (asset_id is not null) or (building_id is not null)
  ),

  category     public.erp_wo_category       not null,
  priority     public.ticket_priority        not null default 'P3',
  frequency    public.erp_preventive_frequency not null,

  -- Designated supplier for this recurring job
  assigned_supplier_id uuid null references public.erp_md_suppliers(id) on delete set null,

  -- Scheduler state
  is_active           boolean not null default true,
  auto_generate_wo    boolean not null default true,
  next_due_date       date    not null,
  last_generated_at   timestamptz null,

  -- WO template fields used when auto-generating a Work Order
  wo_title_template       text not null default '',
  wo_description_template text null,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.erp_preventive_plans is
  'Recurring maintenance schedule. When next_due_date <= today and '
  'auto_generate_wo = true, the scheduler creates a new erp_work_order '
  'with trigger_source = ''system_automated'' and advances next_due_date '
  'by the frequency interval. Replaces the legacy preventive_tasks table.';

comment on column public.erp_preventive_plans.next_due_date is
  'The scheduler advances this date each time a WO is generated. '
  'Calculation: next_due_date += frequency_interval (handled in application).';

create index erp_prev_company_idx    on public.erp_preventive_plans (company_id);
create index erp_prev_asset_idx      on public.erp_preventive_plans (asset_id)    where asset_id    is not null;
create index erp_prev_building_idx   on public.erp_preventive_plans (building_id) where building_id is not null;
create index erp_prev_due_active_idx on public.erp_preventive_plans (next_due_date, is_active, auto_generate_wo);

create trigger erp_prev_updated_at
  before update on public.erp_preventive_plans
  for each row execute function public.set_updated_at();

-- RLS ──────────────────────────────────────────────────────────────────────

alter table public.erp_preventive_plans enable row level security;

create policy "erp_prev_select"
  on public.erp_preventive_plans for select to authenticated
  using (public.erp_can_manage_company(company_id));

create policy "erp_prev_write"
  on public.erp_preventive_plans for all to authenticated
  using   (public.erp_can_manage_company(company_id))
  with check (public.erp_can_manage_company(company_id));

grant select, insert, update, delete on public.erp_preventive_plans to authenticated;
grant all                            on public.erp_preventive_plans to service_role;

-- ---------------------------------------------------------------------------
-- SECTION 5 — FK back-references now that all tables in this migration exist
-- ---------------------------------------------------------------------------

-- erp_work_orders.source_preventive_plan_id → erp_preventive_plans
alter table public.erp_work_orders
  add constraint erp_wo_prev_plan_fk
    foreign key (source_preventive_plan_id)
    references public.erp_preventive_plans(id)
    on delete set null;

create index erp_wo_prev_plan_idx
  on public.erp_work_orders (source_preventive_plan_id)
  where source_preventive_plan_id is not null;

-- ---------------------------------------------------------------------------
-- SECTION 6 — SLA Calculation Helper RPC
--
-- Resolves the most specific SLA rule for a (supplier, building, category,
-- priority) combination.  Building-level rule takes priority over company-wide.
-- Called by the application when creating a Work Order to populate
-- sla_response_due_at and sla_resolution_due_at.
-- ---------------------------------------------------------------------------

create or replace function public.erp_resolve_sla(
  p_company_id  text,
  p_supplier_id uuid,
  p_building_id uuid,
  p_category    public.erp_wo_category,
  p_priority    public.ticket_priority,
  p_created_at  timestamptz default now()
)
returns table (
  response_due_at   timestamptz,
  resolution_due_at timestamptz,
  penalty_amount    numeric,
  penalty_cap_pct   numeric,
  sla_rule_id       uuid
)
language sql stable security definer
set search_path = public
as $$
  -- Building-specific rule takes priority over company-wide (building_id IS NULL)
  select
    p_created_at + (s.response_hours   || ' hours')::interval,
    p_created_at + (s.resolution_hours || ' hours')::interval,
    s.penalty_amount_per_breach,
    s.penalty_cap_percent,
    s.id
  from public.erp_sla_contracts s
  where s.company_id  = p_company_id
    and s.supplier_id = p_supplier_id
    and s.category    = p_category
    and s.priority    = p_priority
    and s.is_active   = true
    and (s.valid_until is null or s.valid_until >= current_date)
    and (s.building_id = p_building_id or s.building_id is null)
  order by s.building_id nulls last  -- building-specific rule wins
  limit 1;
$$;

comment on function public.erp_resolve_sla is
  'Returns SLA deadlines and penalty terms for a new Work Order. '
  'Building-level rules override company-wide rules. Returns no rows if '
  'no matching SLA contract exists (WO proceeds without SLA enforcement).';
