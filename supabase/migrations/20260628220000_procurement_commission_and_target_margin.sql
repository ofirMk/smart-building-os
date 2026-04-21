-- Procurement commission auto-deduction on subcontractor bills +
-- target margin KPI on projects for the Bento profitability dashboard.

-- 1) Target margin (%) on the project itself.
alter table public.erp_proj_projects
  add column if not exists target_margin_pct numeric(8,4) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_proj_projects_target_margin_pct_chk'
      and conrelid = 'public.erp_proj_projects'::regclass
  ) then
    alter table public.erp_proj_projects
      add constraint erp_proj_projects_target_margin_pct_chk
      check (target_margin_pct >= 0 and target_margin_pct <= 100);
  end if;
end
$$;

-- 2) Procurement-commission percentage on the supplier/subcontractor contract.
alter table public.erp_contracts
  add column if not exists procurement_commission_pct numeric(8,4) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_contracts_procurement_commission_pct_chk'
      and conrelid = 'public.erp_contracts'::regclass
  ) then
    alter table public.erp_contracts
      add constraint erp_contracts_procurement_commission_pct_chk
      check (procurement_commission_pct >= 0 and procurement_commission_pct <= 100);
  end if;
end
$$;

-- 3) Subcontractor-bill deduction columns. The trigger below keeps the
--    commission % / amount / net columns in sync with the supplier's
--    active contract.
alter table public.erp_subcontractor_bills
  add column if not exists procurement_commission_pct numeric(8,4) not null default 0,
  add column if not exists procurement_commission_amount numeric(18,2) not null default 0,
  add column if not exists net_approved_amount numeric(18,2) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_subcontractor_bills_commission_pct_chk'
      and conrelid = 'public.erp_subcontractor_bills'::regclass
  ) then
    alter table public.erp_subcontractor_bills
      add constraint erp_subcontractor_bills_commission_pct_chk
      check (procurement_commission_pct >= 0 and procurement_commission_pct <= 100);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_subcontractor_bills_commission_amount_chk'
      and conrelid = 'public.erp_subcontractor_bills'::regclass
  ) then
    alter table public.erp_subcontractor_bills
      add constraint erp_subcontractor_bills_commission_amount_chk
      check (procurement_commission_amount >= 0);
  end if;
end
$$;

-- 4) Trigger: pull the commission % from the subcontractor's contract for
--    this project + supplier (preferring ACTIVE, newest first) and apply it
--    as a separate deduction on top of `approved_amount`.
create or replace function public.erp_subcontractor_bill_apply_commission_trg()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_commission_pct numeric(8,4);
  v_base numeric(18,2);
begin
  if new.procurement_commission_pct is null or new.procurement_commission_pct = 0 then
    select coalesce(c.procurement_commission_pct, 0)
    into v_commission_pct
    from public.erp_contracts c
    where c.company_id = new.company_id
      and c.project_id = new.project_id
      and c.supplier_id = new.supplier_id
    order by
      case when c.status = 'ACTIVE' then 0 else 1 end,
      c.created_at desc
    limit 1;

    new.procurement_commission_pct := coalesce(v_commission_pct, 0);
  end if;

  v_base := coalesce(new.approved_amount, new.submitted_amount, 0);
  new.procurement_commission_amount :=
    round(v_base * coalesce(new.procurement_commission_pct, 0) / 100, 2);
  new.net_approved_amount :=
    round(coalesce(new.approved_amount, 0) - coalesce(new.procurement_commission_amount, 0), 2);

  return new;
end;
$$;

drop trigger if exists erp_subcontractor_bill_apply_commission_trg
  on public.erp_subcontractor_bills;
create trigger erp_subcontractor_bill_apply_commission_trg
before insert or update of
  submitted_amount,
  approved_amount,
  procurement_commission_pct,
  supplier_id,
  project_id
  on public.erp_subcontractor_bills
for each row
execute function public.erp_subcontractor_bill_apply_commission_trg();

-- 5) One-shot backfill for existing rows so the dashboard/query layer has
--    non-zero commission numbers from day one.
update public.erp_subcontractor_bills b
set procurement_commission_pct = coalesce(c.procurement_commission_pct, 0),
    procurement_commission_amount = round(
      coalesce(b.approved_amount, b.submitted_amount, 0)
      * coalesce(c.procurement_commission_pct, 0) / 100,
      2
    ),
    net_approved_amount = round(
      coalesce(b.approved_amount, 0)
      - round(
          coalesce(b.approved_amount, b.submitted_amount, 0)
          * coalesce(c.procurement_commission_pct, 0) / 100,
          2
        ),
      2
    )
from (
  select distinct on (company_id, project_id, supplier_id)
    company_id,
    project_id,
    supplier_id,
    procurement_commission_pct
  from public.erp_contracts
  order by company_id, project_id, supplier_id,
    case when status = 'ACTIVE' then 0 else 1 end,
    created_at desc
) c
where b.company_id = c.company_id
  and b.project_id = c.project_id
  and b.supplier_id = c.supplier_id
  and b.procurement_commission_pct = 0;
