-- ============================================================================
-- Sprint W2.5 — Deferred FK closure after cost-control schema is in place.
--
-- The W2.5 migration (20260512180000) added two cost-control linkage columns
-- to `erp_client_contract_lines` (control_subchapter_id, control_resource_id)
-- but had to skip the FK constraints because the target tables (
-- `erp_proj_control_subchapters`, `erp_proj_control_resources`) only get
-- created later by the Sept 2026 cost-control migration
-- (20260903100000_erp_cost_control.sql).
--
-- This migration runs AFTER both have been applied and finalises the
-- linkage. Idempotent: skips silently if either FK already exists or
-- either target table is still missing.
-- ============================================================================

do $$
begin
  -- subchapter FK
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_proj_control_subchapters'
  ) and exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_client_contract_lines'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'erp_client_contract_lines_control_subchapter_fk'
  ) then
    alter table public.erp_client_contract_lines
      add constraint erp_client_contract_lines_control_subchapter_fk
      foreign key (control_subchapter_id)
      references public.erp_proj_control_subchapters (id)
      on delete set null;
  end if;

  -- resource FK
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_proj_control_resources'
  ) and exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_client_contract_lines'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'erp_client_contract_lines_control_resource_fk'
  ) then
    alter table public.erp_client_contract_lines
      add constraint erp_client_contract_lines_control_resource_fk
      foreign key (control_resource_id)
      references public.erp_proj_control_resources (id)
      on delete set null;
  end if;
end $$;
