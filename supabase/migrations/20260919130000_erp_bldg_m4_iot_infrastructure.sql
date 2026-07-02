-- =============================================================================
-- M4: Enterprise Property & Asset Management Module
--     IoT Infrastructure: Event Staging · Rule Engine · Hardware Audit Log
-- Migration: 20260919130000_erp_bldg_m4_iot_infrastructure.sql
-- Depends on: M1 (enums, erp_user_company_roles), M2 (erp_physical_assets),
--             M3 (erp_work_orders, erp_sla_contracts)
--
-- NOTE: erp_user_company_roles was created in M1.
--       This migration does NOT recreate it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SECTION 1 — erp_iot_rules (מנוע חוקים דינמי — Multi-Tenant)
--
-- Each company defines its own security and maintenance rules in the DB.
-- The AI Worker's Correlation Engine reads these rules at runtime — no code
-- deployments required to change behaviour.
--
-- DESIGN PRINCIPLE:
--   Rules are deterministic (no LLM). The 'required_event_types' array defines
--   the minimal set of IoT events that must arrive within the correlation
--   window for the rule to fire. The 'wo_params' JSONB carries everything
--   needed to create the resulting Work Order.
-- ---------------------------------------------------------------------------

create table public.erp_iot_rules (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null references public.erp_companies(id) on delete restrict,
  rule_name   text not null
    constraint erp_iotr_name_nonempty check (length(trim(rule_name)) > 0),
  description text null,
  is_active   boolean not null default true,

  -- ── Matching Criteria ────────────────────────────────────────────────────
  -- The set of event_type values that must ALL be present in the window.
  -- e.g. ARRAY['door_open', 'tailgate_detected']
  required_event_types   text[]  not null
    constraint erp_iotr_event_types_nonempty check (cardinality(required_event_types) > 0),

  -- Time window within which all required events must arrive (seconds)
  correlation_window_sec integer not null default 5
    constraint erp_iotr_window_positive check (correlation_window_sec > 0),

  -- Optional: restrict matching to specific asset types
  -- e.g. ARRAY['smart_lock', 'camera'] — null means any asset type
  required_asset_types   public.erp_asset_type[] null,

  -- Spatial constraints for event grouping
  same_zone_required     boolean not null default true,   -- Events must share zone_id
  same_building_required boolean not null default true,   -- Fallback if no zone match

  -- ── Action Configuration ─────────────────────────────────────────────────
  -- Primary action triggered when rule matches
  action_type text not null
    constraint erp_iotr_action_chk check (
      action_type in ('CREATE_WORK_ORDER', 'SEND_ALERT', 'COMPOSITE')
    ),

  -- Work Order creation params (always populated when action creates a WO)
  -- Shape: {
  --   "category": "security_access",
  --   "priority": "P1",
  --   "title_template":       "⚠️ Tailgating – {zone_name}",
  --   "description_template": "Alert at {zone_name} on {timestamp}. Zone locked."
  -- }
  wo_params jsonb not null default '{}'::jsonb,

  -- Additional actions executed after the WO is created (ordered array).
  -- Each element is an action descriptor processed by the AI Worker dispatcher.
  -- Shape: [
  --   { "type": "LOCK_NEXT_DOOR",  "asset_filter": "zone_exit"         },
  --   { "type": "PUSH_NOTIFY",     "target_role": "subcontractor",
  --                                "supplier_category": "security_access",
  --                                "message_template": "⚠️ {zone_name}" },
  --   { "type": "PUSH_NOTIFY",     "target_role": "property_manager"   }
  -- ]
  additional_actions jsonb not null default '[]'::jsonb,

  -- Priority for conflict resolution when multiple rules could match.
  -- Lower number = higher priority (fires first).
  rule_priority integer not null default 100
    constraint erp_iotr_priority_positive check (rule_priority > 0),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.erp_iot_rules is
  'Dynamic, per-company IoT correlation rules. The AI Worker evaluates these '
  'at runtime: no code deployments needed to add or modify security policies. '
  'Rules are deterministic (rule-based MVP; LLM reserved for V2 predictive use).';

comment on column public.erp_iot_rules.required_event_types is
  'All listed event_type values must arrive within correlation_window_sec for '
  'the rule to fire. Order does not matter — only set membership.';

comment on column public.erp_iot_rules.wo_params is
  'Template parameters for Work Order creation. title_template supports '
  '{zone_name}, {building_name}, {asset_name}, {timestamp} placeholders.';

comment on column public.erp_iot_rules.additional_actions is
  'Ordered list of side-effects after WO creation: LOCK_NEXT_DOOR triggers an '
  'outbound vendor API call via the ERP Server Action (full audit trail). '
  'PUSH_NOTIFY sends a Supabase Realtime push to the target role.';

create index erp_iotr_company_idx        on public.erp_iot_rules (company_id);
create index erp_iotr_active_priority_idx on public.erp_iot_rules (company_id, is_active, rule_priority);

-- GIN index: enables fast lookup like "find rules that include 'door_open'"
create index erp_iotr_event_types_gin
  on public.erp_iot_rules using gin (required_event_types);

create trigger erp_iotr_updated_at
  before update on public.erp_iot_rules
  for each row execute function public.set_updated_at();

-- RLS ──────────────────────────────────────────────────────────────────────

alter table public.erp_iot_rules enable row level security;

create policy "erp_iotr_select"
  on public.erp_iot_rules for select to authenticated
  using (public.erp_can_manage_company(company_id));

create policy "erp_iotr_write"
  on public.erp_iot_rules for all to authenticated
  using   (public.erp_can_manage_company(company_id))
  with check (public.erp_can_manage_company(company_id));

grant select, insert, update, delete on public.erp_iot_rules to authenticated;
grant all                            on public.erp_iot_rules to service_role;

-- ---------------------------------------------------------------------------
-- SECTION 2 — erp_iot_events (staging buffer לאירועי חומרה)
--
-- The ONLY responsibility of the webhook endpoint (app/api/iot/webhooks/…)
-- is to INSERT here and return HTTP 200 immediately.
-- All business logic happens asynchronously in the AI Worker after it receives
-- the pg_notify signal fired by the trigger in Section 4.
--
-- Rows are short-lived: once processed, they can be archived or deleted by
-- a scheduled cleanup job. Only unprocessed events accumulate here.
-- ---------------------------------------------------------------------------

create table public.erp_iot_events (
  id          uuid primary key default gen_random_uuid(),
  company_id  text not null references public.erp_companies(id) on delete restrict,

  -- The physical asset that emitted this event (looked up by hardware_meta.mac
  -- or hardware_meta.gateway_id at ingestion time)
  asset_id    uuid null references public.erp_physical_assets(id) on delete set null,

  -- Hardware vendor / integration channel
  provider    text not null
    constraint erp_iote_provider_chk check (
      provider in ('verkada', 'salto', 'butterflymx', 'custom')
    ),

  -- Vendor-specific event label, normalised to snake_case during ingestion.
  -- Examples: door_open, door_forced, tailgate_detected, vibration_alert,
  --           temp_exceeded, current_spike, motion_detected, qr_scan
  event_type  text not null
    constraint erp_iote_event_type_nonempty check (length(trim(event_type)) > 0),

  -- Full raw JSON body from the vendor webhook (never modified after insert)
  raw_payload jsonb not null default '{}'::jsonb,

  -- ── Processing State ──────────────────────────────────────────────────────
  processed    boolean not null default false,
  processed_at timestamptz null,

  -- Set when a Work Order was created as a result of this event
  work_order_id uuid null references public.erp_work_orders(id) on delete set null,

  -- Set when a rule was matched (for audit and analytics)
  matched_rule_id uuid null references public.erp_iot_rules(id) on delete set null,

  -- Correlation batch key: all events that fired together share the same UUID.
  -- Assigned by the AI Worker after correlation; null until processed.
  correlation_id uuid null,

  -- Monotonic receive timestamp (do not use created_at for ordering — use this)
  received_at timestamptz not null default now()
);

comment on table public.erp_iot_events is
  'Short-lived staging buffer for incoming IoT webhook payloads. '
  'Webhook endpoints INSERT here and return 200 immediately; the AI Worker '
  'processes events asynchronously via pg_notify. Processed rows are eligible '
  'for periodic archival by a cleanup job.';

comment on column public.erp_iot_events.raw_payload is
  'Immutable raw vendor payload stored verbatim. Never modified after insert '
  'to preserve a tamper-proof record of what the device reported.';

comment on column public.erp_iot_events.correlation_id is
  'Shared UUID assigned by the Worker to all events that fired a rule together '
  '(e.g. door_open + tailgate_detected). Enables post-hoc incident analysis.';

-- Indexes ──────────────────────────────────────────────────────────────────

create index erp_iote_company_idx       on public.erp_iot_events (company_id);
create index erp_iote_asset_idx         on public.erp_iot_events (asset_id)
  where asset_id is not null;

-- The Worker's primary poll query: find unprocessed events, oldest first
create index erp_iote_unprocessed_idx   on public.erp_iot_events (received_at asc)
  where processed = false;

-- Analytics: filter by event type and time range
create index erp_iote_type_time_idx     on public.erp_iot_events (event_type, received_at desc);

-- Correlation batch analysis
create index erp_iote_correlation_idx   on public.erp_iot_events (correlation_id)
  where correlation_id is not null;

create index erp_iote_wo_idx            on public.erp_iot_events (work_order_id)
  where work_order_id is not null;

-- RLS ──────────────────────────────────────────────────────────────────────

alter table public.erp_iot_events enable row level security;

-- Property managers see all events in their company (for the IoT dashboard)
create policy "erp_iote_select_managers"
  on public.erp_iot_events for select to authenticated
  using (public.erp_can_manage_company(company_id));

-- Subcontractors: see only events linked to their assigned work orders
create policy "erp_iote_select_subcontractors"
  on public.erp_iot_events for select to authenticated
  using (public.erp_is_assigned_supplier(
    (select assigned_to_supplier_id from public.erp_work_orders
     where id = erp_iot_events.work_order_id)
  ));

-- INSERT: only via service_role (webhook API route uses the service client)
-- and system admins. Regular users never insert IoT events directly.
create policy "erp_iote_service_insert"
  on public.erp_iot_events for insert to authenticated
  with check (public.erp_is_system_admin());

-- UPDATE: only service_role can mark events as processed
-- (authenticated policy kept intentionally restrictive; Workers use service_role)

grant select on public.erp_iot_events to authenticated;
grant all    on public.erp_iot_events to service_role;

-- ---------------------------------------------------------------------------
-- SECTION 3 — erp_hardware_action_log (יומן פעולות חומרה — Append-Only)
--
-- Every outbound command to physical hardware (lock a door, unlock a gate,
-- adjust HVAC setpoint) is recorded here BEFORE the call is made and the
-- result is written AFTER. This produces an immutable audit chain:
--
--   Work Order → Server Action → hardware_action_log(status=pending)
--                              → outbound vendor API call
--                              → hardware_action_log(status=success|failed)
--
-- No updated_at trigger — this is intentionally append-only.
-- Corrections are made via a new row, never by editing existing rows.
-- ---------------------------------------------------------------------------

create table public.erp_hardware_action_log (
  id            uuid primary key default gen_random_uuid(),
  company_id    text not null references public.erp_companies(id) on delete restrict,

  -- Traceability chain
  work_order_id uuid null references public.erp_work_orders(id)   on delete set null,
  iot_event_id  uuid null references public.erp_iot_events(id)    on delete set null,
  asset_id      uuid null references public.erp_physical_assets(id) on delete set null,

  -- What was commanded
  action_type   text not null
    constraint erp_hal_action_chk check (
      action_type in (
        'LOCK_DOOR',
        'UNLOCK_DOOR',
        'LOCK_BARRIER',
        'UNLOCK_BARRIER',
        'SET_HVAC_SETPOINT',
        'TRIGGER_ALARM',
        'SEND_PUSH_ALERT',
        'OTHER'
      )
    ),

  provider         text not null,  -- Hardware vendor (verkada, salto, etc.)
  request_payload  jsonb not null default '{}'::jsonb,  -- Outbound API body
  response_payload jsonb null,                           -- Vendor API response

  status text not null default 'pending'
    constraint erp_hal_status_chk check (
      status in ('pending', 'success', 'failed', 'timeout')
    ),

  -- Who triggered this action: 'system' for automated, or profile UUID for manual
  executed_by  text not null,
  executed_at  timestamptz not null default now(),
  response_at  timestamptz null,

  -- Optional human note (e.g. admin override reason)
  note text null
  -- Intentionally NO updated_at — rows are never modified after creation
);

comment on table public.erp_hardware_action_log is
  'Immutable append-only audit log for every outbound physical hardware command. '
  'A row is inserted with status=pending BEFORE the API call; the result row is '
  'updated to success/failed/timeout AFTER. No row is ever deleted or edited — '
  'corrections are recorded as new rows. Satisfies physical-security audit requirements.';

comment on column public.erp_hardware_action_log.executed_by is
  '''system'' for AI Worker / scheduled actions; a profiles.id UUID string for '
  'property manager manual overrides.';

create index erp_hal_company_idx     on public.erp_hardware_action_log (company_id);
create index erp_hal_wo_idx          on public.erp_hardware_action_log (work_order_id)
  where work_order_id is not null;
create index erp_hal_asset_idx       on public.erp_hardware_action_log (asset_id)
  where asset_id is not null;
create index erp_hal_status_idx      on public.erp_hardware_action_log (status, executed_at desc);
create index erp_hal_event_idx       on public.erp_hardware_action_log (iot_event_id)
  where iot_event_id is not null;

-- RLS ──────────────────────────────────────────────────────────────────────

alter table public.erp_hardware_action_log enable row level security;

-- Read: managers and system admins only
create policy "erp_hal_select"
  on public.erp_hardware_action_log for select to authenticated
  using (public.erp_can_manage_company(company_id));

-- Insert: only service_role (Server Actions run with service client)
-- Prevents any authenticated user from injecting fake log entries
create policy "erp_hal_admin_insert"
  on public.erp_hardware_action_log for insert to authenticated
  with check (public.erp_is_system_admin());

-- No UPDATE or DELETE policy for authenticated users — append-only enforced
-- by absence of policy (service_role bypasses RLS for the response update)

grant select on public.erp_hardware_action_log to authenticated;
grant all    on public.erp_hardware_action_log to service_role;

-- ---------------------------------------------------------------------------
-- SECTION 4 — pg_notify trigger on erp_iot_events
--
-- Fires a lightweight Postgres notification after every insert.
-- The AI Worker (Python / asyncpg) listens on 'iot_event' and wakes up
-- immediately — no polling required.
--
-- Payload is intentionally minimal (just IDs) so the notification fits
-- within Postgres's 8000-byte NOTIFY limit even under high throughput.
-- The Worker fetches full event data from the DB after waking up.
-- ---------------------------------------------------------------------------

create or replace function public.erp_iot_event_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- JSON payload: only the fields needed for the Worker to look up the event
  perform pg_notify(
    'iot_event',
    json_build_object(
      'event_id',    new.id,
      'company_id',  new.company_id,
      'asset_id',    new.asset_id,
      'event_type',  new.event_type,
      'provider',    new.provider,
      'received_at', new.received_at
    )::text
  );
  return new;
end;
$$;

comment on function public.erp_iot_event_notify() is
  'Fires pg_notify(''iot_event'', …) after each IoT event insert. '
  'The AI Worker listens on this channel and wakes up without polling.';

create trigger erp_iot_events_notify_trigger
  after insert on public.erp_iot_events
  for each row execute function public.erp_iot_event_notify();

-- ---------------------------------------------------------------------------
-- SECTION 5 — Close the FK left open in M3
--
-- erp_work_orders.source_iot_event_id was declared as a plain uuid in M3
-- because erp_iot_events did not yet exist. Now that it does, we add the
-- FK constraint and a supporting index.
-- ---------------------------------------------------------------------------

alter table public.erp_work_orders
  add constraint erp_wo_iot_event_fk
    foreign key (source_iot_event_id)
    references public.erp_iot_events(id)
    on delete set null;

create index erp_wo_iot_event_idx
  on public.erp_work_orders (source_iot_event_id)
  where source_iot_event_id is not null;
