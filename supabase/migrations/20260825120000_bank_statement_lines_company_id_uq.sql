-- ============================================================================
-- Hotfix — `erp_bank_statement_lines.(company_id, id)` composite unique.
--
-- The original bank reconciliation migration (20260825110000) declared a
-- single-column primary key on `id` only. Downstream migrations
-- (20260826100000_ap_payments_masav.sql) reference this table via a
-- composite FK on `(company_id, id)`, which Postgres requires backed by a
-- unique constraint. This migration retro-fits that constraint.
--
-- Idempotent: skips if already present.
-- ============================================================================

do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_bank_statement_lines'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'erp_bank_statement_lines_company_id_uq'
  ) then
    alter table public.erp_bank_statement_lines
      add constraint erp_bank_statement_lines_company_id_uq unique (company_id, id);
  end if;
end $$;
