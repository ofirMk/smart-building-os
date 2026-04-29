-- Step 3 cross-module linkage:
-- 1) procurement POs bind to PBC projects
-- 2) procurement PO lines bind directly to PBC BOQ nodes
-- 3) contracts bind to PBC projects

alter table public.proc_purchase_orders
  add column if not exists pbc_project_id uuid null;

alter table public.ctr_contracts
  add column if not exists pbc_project_id uuid null;

alter table public.proc_purchase_order_lines
  add column if not exists pbc_boq_node_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'proc_purchase_orders_company_pbc_project_fk'
  ) then
    alter table public.proc_purchase_orders
      add constraint proc_purchase_orders_company_pbc_project_fk
      foreign key (company_id, pbc_project_id)
      references public.pbc_projects (company_id, id)
      on delete set null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ctr_contracts_company_pbc_project_fk'
  ) then
    alter table public.ctr_contracts
      add constraint ctr_contracts_company_pbc_project_fk
      foreign key (company_id, pbc_project_id)
      references public.pbc_projects (company_id, id)
      on delete set null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'proc_po_lines_company_pbc_boq_fk'
  ) then
    alter table public.proc_purchase_order_lines
      add constraint proc_po_lines_company_pbc_boq_fk
      foreign key (company_id, pbc_boq_node_id)
      references public.pbc_boq_nodes (company_id, id)
      on delete set null;
  end if;
end
$$;

create index if not exists proc_purchase_orders_company_pbc_project_idx
  on public.proc_purchase_orders (company_id, pbc_project_id);

create index if not exists ctr_contracts_company_pbc_project_idx
  on public.ctr_contracts (company_id, pbc_project_id);

create index if not exists proc_po_lines_company_boq_node_idx
  on public.proc_purchase_order_lines (company_id, pbc_boq_node_id);
