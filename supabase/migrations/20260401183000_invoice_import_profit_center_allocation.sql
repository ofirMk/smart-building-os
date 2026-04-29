-- Marker Ofek: Profit center allocation for AI invoice ingestion
do $$
begin
  if to_regclass('public.mo_supplier_invoice_imports') is not null then
    alter table public.mo_supplier_invoice_imports
      add column if not exists profit_center_id uuid references public.projects (id) on delete set null,
      add column if not exists allocation_status text not null default 'pending',
      add column if not exists cost_update_applied boolean not null default false;

    create index if not exists mo_supplier_invoice_imports_profit_center_id_idx
      on public.mo_supplier_invoice_imports (profit_center_id);

    create index if not exists mo_supplier_invoice_imports_allocation_status_idx
      on public.mo_supplier_invoice_imports (allocation_status);

    comment on column public.mo_supplier_invoice_imports.profit_center_id is
      'שיוך לחשבונית למרכז רווח / פרויקט';
    comment on column public.mo_supplier_invoice_imports.allocation_status is
      'pending | allocated | cost_update_skipped';
    comment on column public.mo_supplier_invoice_imports.cost_update_applied is
      'האם עלות עודכנה בתקציב הפרויקט (מותר רק אחרי שיוך profit center)';
  else
    raise notice 'Skipping invoice import allocation migration: table public.mo_supplier_invoice_imports does not exist';
  end if;
end
$$;
