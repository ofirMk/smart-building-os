-- ============================================================================
-- Sprint T5 — Deferred raw-material offset → client bill linkage.
--
-- The T5 migration (20260512220000) tried to add `client_bill_id` to
-- `erp_contract_raw_material_offsets`, but that table is only created by the
-- Sept 2026 W2 foundation migration (20260911100000). T5 ran first and
-- skipped section 2 via a guard. This migration finalises it after the
-- table exists.
--
-- Idempotent: each step is `IF NOT EXISTS` / `IF EXISTS`.
-- ============================================================================

do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'erp_contract_raw_material_offsets'
  ) then
    execute 'alter table public.erp_contract_raw_material_offsets
             add column if not exists client_bill_id uuid null';

    if not exists (
      select 1 from pg_constraint
      where conname = 'erp_raw_material_offsets_client_bill_fk'
    ) then
      execute 'alter table public.erp_contract_raw_material_offsets
               add constraint erp_raw_material_offsets_client_bill_fk
               foreign key (company_id, client_bill_id)
               references public.erp_client_progress_bills (company_id, id)
               on delete set null';
    end if;

    execute 'create index if not exists erp_raw_material_offsets_client_bill_idx
             on public.erp_contract_raw_material_offsets (company_id, client_bill_id)
             where client_bill_id is not null';

    execute $cmt$comment on column public.erp_contract_raw_material_offsets.client_bill_id is 'MedaTech §3.3 owner-side — when a raw-material offset row is attached to an OWNER bill, the T2 waterfall picks it up via this column.'$cmt$;
  end if;
end $$;
