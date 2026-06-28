-- =============================================================================
-- Phase 14 — Dynamic Approval Matrix
--
-- Adds a configurable rules engine that routes POs to different approval
-- chains based on multi-condition matching (amount range, cost-center, supplier,
-- urgency, PO type).  Builds on top of the existing Phase 7.7 skeleton
-- (erp_po_approvals, erp_po_types.approval_chain_json) by adding:
--
--   1. erp_approval_matrix_rules   — company-level rule definitions
--   2. erp_po_approval_instances   — which rule matched for a given PO
--   3. erp_po_approval_decisions   — per-level decisions (approve/reject/delegate)
--
-- The engine that evaluates rules lives in TypeScript
-- (lib/procurement/approval-matrix-engine.ts) to leverage JS tooling and
-- avoid overloading the DB with business logic.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) erp_approval_matrix_rules
-- ---------------------------------------------------------------------------
create table if not exists public.erp_approval_matrix_rules (
  id               uuid primary key default gen_random_uuid(),
  company_id       text not null references public.erp_companies(id) on delete cascade,
  rule_name        text not null,
  description      text,
  priority_order   integer not null default 0,
  is_active        boolean not null default true,

  -- condition_json: { amount_min, amount_max, cost_center_codes[], project_ids[],
  --                   supplier_ids[], urgency_levels[], po_type_codes[] }
  -- Empty / null values = "match all" for that field.
  condition_json   jsonb not null default '{}',

  -- approval_levels_json: [{ level, role?, user_id?, amount_limit?, label? }]
  -- Each entry = one required sign-off level (sequential).
  approval_levels_json jsonb not null default '[]',

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Within one company, priority_order must be unique (used for deterministic matching)
  constraint erp_approval_matrix_rules_priority_uniq unique (company_id, priority_order)
);

create index if not exists erp_approval_matrix_rules_company_active_idx
  on public.erp_approval_matrix_rules (company_id, is_active, priority_order);

comment on table public.erp_approval_matrix_rules is
  'Phase 14 — Configurable approval routing rules. First active rule (lowest priority_order) '
  'whose condition_json matches the PO determines the approval chain.';

comment on column public.erp_approval_matrix_rules.condition_json is
  'Matching conditions. Null/empty arrays = wildcard. '
  'Schema: { amount_min?: number, amount_max?: number, cost_center_codes?: string[], '
  'project_ids?: string[], supplier_ids?: string[], urgency_levels?: string[], po_type_codes?: string[] }';

comment on column public.erp_approval_matrix_rules.approval_levels_json is
  'Ordered approval levels. Schema: [{ level: number, role?: string, user_id?: uuid, '
  'amount_limit?: number, label?: string }]';

alter table public.erp_approval_matrix_rules enable row level security;

drop policy if exists erp_approval_matrix_rules_rls on public.erp_approval_matrix_rules;
create policy erp_approval_matrix_rules_rls
  on public.erp_approval_matrix_rules
  for all
  using  (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- ---------------------------------------------------------------------------
-- 2) erp_po_approval_instances
--    One row per PO (unique). Created when a PO is submitted for approval
--    via the matrix engine.
-- ---------------------------------------------------------------------------
create table if not exists public.erp_po_approval_instances (
  id                      uuid primary key default gen_random_uuid(),
  company_id              text not null references public.erp_companies(id) on delete cascade,
  purchase_order_id       uuid not null references public.erp_purchase_orders(id) on delete cascade,
  matrix_rule_id          uuid references public.erp_approval_matrix_rules(id) on delete set null,
  current_level           integer not null default 1,
  total_levels            integer not null default 1,
  status                  text not null default 'PENDING'
                            check (status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
  -- Snapshot of resolved approvers at the time of submission (for display + fallback)
  resolved_approvers_json jsonb not null default '[]',
  rule_snapshot_json      jsonb,        -- full rule snapshot at time of match
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint erp_po_approval_instances_po_uniq unique (purchase_order_id)
);

create index if not exists erp_po_approval_instances_company_idx
  on public.erp_po_approval_instances (company_id, status, created_at desc);

comment on table public.erp_po_approval_instances is
  'Phase 14 — Runtime approval instance for a PO. Tracks which matrix rule matched '
  'and what level the approval is currently at.';

alter table public.erp_po_approval_instances enable row level security;

drop policy if exists erp_po_approval_instances_rls on public.erp_po_approval_instances;
create policy erp_po_approval_instances_rls
  on public.erp_po_approval_instances
  for all
  using  (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- ---------------------------------------------------------------------------
-- 3) erp_po_approval_decisions
--    One row per level per instance. Supports delegation.
-- ---------------------------------------------------------------------------
create table if not exists public.erp_po_approval_decisions (
  id                    uuid primary key default gen_random_uuid(),
  company_id            text not null references public.erp_companies(id) on delete cascade,
  instance_id           uuid not null references public.erp_po_approval_instances(id) on delete cascade,
  level                 integer not null check (level >= 1),
  approver_user_id      uuid references auth.users(id) on delete set null,
  decision              text not null
                          check (decision in ('APPROVED','REJECTED','DELEGATED')),
  comment               text,
  decided_at            timestamptz not null default now(),
  delegated_to_user_id  uuid references auth.users(id) on delete set null,

  constraint erp_po_approval_decisions_instance_level_uniq
    unique (instance_id, level)
);

create index if not exists erp_po_approval_decisions_instance_idx
  on public.erp_po_approval_decisions (instance_id, level);

comment on table public.erp_po_approval_decisions is
  'Phase 14 — Per-level approval decisions with optional delegation.';

alter table public.erp_po_approval_decisions enable row level security;

drop policy if exists erp_po_approval_decisions_rls on public.erp_po_approval_decisions;
create policy erp_po_approval_decisions_rls
  on public.erp_po_approval_decisions
  for all
  using  (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- ---------------------------------------------------------------------------
-- 4) Seed a "catch-all" default fallback rule for each existing company
--    (priority_order = 9999 → last resort; requires PROCUREMENT_MANAGER).
--    Idempotent: inserts only if no rule exists yet for the company.
-- ---------------------------------------------------------------------------
insert into public.erp_approval_matrix_rules
  (company_id, rule_name, description, priority_order, is_active,
   condition_json, approval_levels_json)
select
  c.id,
  'ברירת מחדל — כל הזמנה',
  'כלל ברירת מחדל: כל הזמנה ללא כלל ספציפי תנותב לאישור מנהל רכש',
  9999,
  true,
  '{}'::jsonb,
  '[{"level":1,"role":"PROCUREMENT_MANAGER","label":"מנהל רכש"}]'::jsonb
from public.erp_companies c
where not exists (
  select 1 from public.erp_approval_matrix_rules r
  where r.company_id = c.id
)
on conflict (company_id, priority_order) do nothing;
