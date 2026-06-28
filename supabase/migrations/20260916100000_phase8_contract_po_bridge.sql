-- ============================================================================
-- Phase 8: Contract & Blanket Orders — PO ↔ Contract Bridge
-- Migration: 20260916100000_phase8_contract_po_bridge.sql
--
-- Adds the minimal FK columns needed to link Purchase Orders to the
-- existing erp_subcontractor_contracts + erp_contract_boq_lines schema.
-- All changes are fully additive (no DROP, no ALTER COLUMN removing data).
--
-- New columns:
--   erp_purchase_orders
--     .contract_id       — FK to erp_subcontractor_contracts; marks this PO as
--                          a Release Order drawn from the framework contract.
--     .is_release_order  — Explicit boolean flag (true when contract_id is set)
--                          kept separate for query convenience.
--
--   erp_purchase_order_lines
--     .contract_line_id      — FK to erp_contract_boq_lines; links the line to
--                              a specific BoQ entry in the framework contract.
--     .contract_unit_price   — Snapshot of the contract's locked unit price at
--                              PO creation time (immutable reference).
--     .price_override_reason — If the ordered unit_price ≠ contract_unit_price,
--                              this field MUST be populated (required by the
--                              Phase 8.3 price-lock enforcement logic in the
--                              PO creation API).
-- ============================================================================

set search_path = public;

-- ── erp_purchase_orders ────────────────────────────────────────────────────

alter table public.erp_purchase_orders
  add column if not exists contract_id uuid null
    references public.erp_subcontractor_contracts (id) on delete set null,
  add column if not exists is_release_order boolean not null default false;

comment on column public.erp_purchase_orders.contract_id is
  'Phase 8.1 — FK to erp_subcontractor_contracts. Non-null = this PO is a '
  'Release Order drawn against the referenced framework contract.';
comment on column public.erp_purchase_orders.is_release_order is
  'Phase 8.1 — Denormalised flag (mirrors contract_id IS NOT NULL) for fast '
  'filtering of release orders in the PO list and balance calculations.';

create index if not exists erp_purchase_orders_contract_idx
  on public.erp_purchase_orders (company_id, contract_id)
  where contract_id is not null;

-- ── erp_purchase_order_lines ───────────────────────────────────────────────

alter table public.erp_purchase_order_lines
  add column if not exists contract_line_id uuid null
    references public.erp_contract_boq_lines (id) on delete set null,
  add column if not exists contract_unit_price numeric(18,2) null
    constraint erp_po_lines_contract_price_nn check (contract_unit_price is null or contract_unit_price >= 0),
  add column if not exists price_override_reason text null;

comment on column public.erp_purchase_order_lines.contract_line_id is
  'Phase 8 — FK to erp_contract_boq_lines. Links this PO line to a specific '
  'BoQ entry in the parent framework contract.';
comment on column public.erp_purchase_order_lines.contract_unit_price is
  'Phase 8.3 — Snapshot of erp_contract_boq_lines.unit_price at PO creation '
  'time. Used to detect price overrides without re-fetching the contract.';
comment on column public.erp_purchase_order_lines.price_override_reason is
  'Phase 8.3 — Required when unit_price ≠ contract_unit_price. Documents why '
  'the ordered price deviates from the contract locked price.';

create index if not exists erp_po_lines_contract_line_idx
  on public.erp_purchase_order_lines (company_id, contract_line_id)
  where contract_line_id is not null;
