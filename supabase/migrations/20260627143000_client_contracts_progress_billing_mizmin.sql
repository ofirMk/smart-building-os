-- Client Contracts & Progress Billing (Mizmin)

do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_change_order_type') then
    create type public.erp_change_order_type as enum ('NEW_LINE', 'QTY_CHANGE', 'PRICE_CHANGE');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_client_progress_bill_status') then
    create type public.erp_client_progress_bill_status as enum ('DRAFT', 'SUBMITTED', 'PARTIALLY_APPROVED', 'APPROVED');
  end if;
end $$;

create table if not exists public.erp_client_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  project_id uuid not null references public.erp_proj_projects (id) on delete restrict,
  contract_number text not null,
  client_name text not null,
  title text not null,
  status text not null default 'DRAFT',
  indexation_pct numeric(8,4) not null default 0,
  retention_pct numeric(8,4) not null default 0,
  advance_payment_amount numeric(18,2) not null default 0,
  advance_repayment_pct numeric(8,4) not null default 0,
  total_amount numeric(18,2) not null default 0,
  start_date date null,
  end_date date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_client_contracts_number_nonempty check (length(trim(contract_number)) > 0),
  constraint erp_client_contracts_title_nonempty check (length(trim(title)) > 0),
  constraint erp_client_contracts_status_chk check (status in ('DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED')),
  constraint erp_client_contracts_indexation_pct_nonnegative check (indexation_pct >= 0),
  constraint erp_client_contracts_retention_pct_range check (retention_pct >= 0 and retention_pct <= 100),
  constraint erp_client_contracts_advance_amount_nonnegative check (advance_payment_amount >= 0),
  constraint erp_client_contracts_advance_repayment_pct_range check (advance_repayment_pct >= 0 and advance_repayment_pct <= 100),
  constraint erp_client_contracts_total_nonnegative check (total_amount >= 0),
  constraint erp_client_contracts_uq unique (company_id, contract_number)
);

create unique index if not exists erp_client_contracts_company_id_uq
  on public.erp_client_contracts (company_id, id);

drop trigger if exists erp_client_contracts_updated_at on public.erp_client_contracts;
create trigger erp_client_contracts_updated_at
before update on public.erp_client_contracts
for each row execute function public.set_updated_at();

create table if not exists public.erp_client_contract_lines (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  client_contract_id uuid not null references public.erp_client_contracts (id) on delete cascade,
  line_number int not null default 1,
  boq_ref text null,
  description text not null,
  quantity numeric(18,3) not null default 0,
  unit_price numeric(18,2) not null default 0,
  total_price numeric(18,2) generated always as (round(quantity * unit_price, 2)) stored,
  retainage_exempt boolean not null default false,
  is_advance_line boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_client_contract_lines_description_nonempty check (length(trim(description)) > 0),
  constraint erp_client_contract_lines_quantity_nonnegative check (quantity >= 0),
  constraint erp_client_contract_lines_unit_price_nonnegative check (unit_price >= 0),
  constraint erp_client_contract_lines_line_number_positive check (line_number > 0),
  constraint erp_client_contract_lines_company_contract_fk
    foreign key (company_id, client_contract_id)
    references public.erp_client_contracts (company_id, id)
    on delete cascade
);

create unique index if not exists erp_client_contract_lines_company_id_uq
  on public.erp_client_contract_lines (company_id, id);
create index if not exists erp_client_contract_lines_company_contract_idx
  on public.erp_client_contract_lines (company_id, client_contract_id, line_number);

drop trigger if exists erp_client_contract_lines_updated_at on public.erp_client_contract_lines;
create trigger erp_client_contract_lines_updated_at
before update on public.erp_client_contract_lines
for each row execute function public.set_updated_at();

create table if not exists public.erp_change_orders (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  client_contract_id uuid not null references public.erp_client_contracts (id) on delete cascade,
  contract_line_id uuid null references public.erp_client_contract_lines (id) on delete set null,
  change_order_number text not null,
  change_type public.erp_change_order_type not null,
  new_line_description text null,
  qty_delta numeric(18,3) null,
  new_unit_price numeric(18,2) null,
  status text not null default 'DRAFT',
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_change_orders_number_nonempty check (length(trim(change_order_number)) > 0),
  constraint erp_change_orders_status_chk check (status in ('DRAFT', 'ACTIVE', 'APPROVED', 'REJECTED')),
  constraint erp_change_orders_new_unit_price_nonnegative check (new_unit_price is null or new_unit_price >= 0),
  constraint erp_change_orders_uq unique (company_id, change_order_number),
  constraint erp_change_orders_company_contract_fk
    foreign key (company_id, client_contract_id)
    references public.erp_client_contracts (company_id, id)
    on delete cascade
);

create index if not exists erp_change_orders_company_contract_idx
  on public.erp_change_orders (company_id, client_contract_id, created_at desc);

drop trigger if exists erp_change_orders_updated_at on public.erp_change_orders;
create trigger erp_change_orders_updated_at
before update on public.erp_change_orders
for each row execute function public.set_updated_at();

create table if not exists public.erp_client_progress_bills (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  client_contract_id uuid not null references public.erp_client_contracts (id) on delete cascade,
  bill_number text not null,
  period_start date null,
  period_end date null,
  status public.erp_client_progress_bill_status not null default 'DRAFT',
  submitted_total_amount numeric(18,2) not null default 0,
  approved_total_amount numeric(18,2) not null default 0,
  indexed_submitted_amount numeric(18,2) not null default 0,
  indexed_approved_amount numeric(18,2) not null default 0,
  retention_deducted_amount numeric(18,2) not null default 0,
  advance_repayment_amount numeric(18,2) not null default 0,
  net_approved_payable numeric(18,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_client_progress_bills_uq unique (company_id, bill_number),
  constraint erp_client_progress_bills_company_contract_fk
    foreign key (company_id, client_contract_id)
    references public.erp_client_contracts (company_id, id)
    on delete cascade
);

create unique index if not exists erp_client_progress_bills_company_id_uq
  on public.erp_client_progress_bills (company_id, id);
create index if not exists erp_client_progress_bills_company_contract_idx
  on public.erp_client_progress_bills (company_id, client_contract_id, created_at desc);

drop trigger if exists erp_client_progress_bills_updated_at on public.erp_client_progress_bills;
create trigger erp_client_progress_bills_updated_at
before update on public.erp_client_progress_bills
for each row execute function public.set_updated_at();

create table if not exists public.erp_client_progress_bill_lines (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  progress_bill_id uuid not null references public.erp_client_progress_bills (id) on delete cascade,
  contract_line_id uuid not null references public.erp_client_contract_lines (id) on delete restrict,
  submitted_qty numeric(18,3) not null default 0,
  submitted_amount numeric(18,2) not null default 0,
  approved_qty numeric(18,3) not null default 0,
  approved_amount numeric(18,2) not null default 0,
  approved_manual_override boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_client_progress_bill_lines_submitted_qty_nonnegative check (submitted_qty >= 0),
  constraint erp_client_progress_bill_lines_submitted_amount_nonnegative check (submitted_amount >= 0),
  constraint erp_client_progress_bill_lines_approved_qty_nonnegative check (approved_qty >= 0),
  constraint erp_client_progress_bill_lines_approved_amount_nonnegative check (approved_amount >= 0),
  constraint erp_client_progress_bill_lines_company_bill_fk
    foreign key (company_id, progress_bill_id)
    references public.erp_client_progress_bills (company_id, id)
    on delete cascade,
  constraint erp_client_progress_bill_lines_company_contract_line_fk
    foreign key (company_id, contract_line_id)
    references public.erp_client_contract_lines (company_id, id)
    on delete restrict,
  constraint erp_client_progress_bill_lines_uq unique (company_id, progress_bill_id, contract_line_id)
);

create index if not exists erp_client_progress_bill_lines_company_bill_idx
  on public.erp_client_progress_bill_lines (company_id, progress_bill_id);

drop trigger if exists erp_client_progress_bill_lines_updated_at on public.erp_client_progress_bill_lines;
create trigger erp_client_progress_bill_lines_updated_at
before update on public.erp_client_progress_bill_lines
for each row execute function public.set_updated_at();

create or replace function public.erp_recalculate_client_contract_total(
  p_company_id text,
  p_client_contract_id uuid
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric(18,2);
begin
  select coalesce(round(sum(total_price), 2), 0)
  into v_total
  from public.erp_client_contract_lines
  where company_id = p_company_id
    and client_contract_id = p_client_contract_id;

  update public.erp_client_contracts
  set total_amount = v_total
  where company_id = p_company_id and id = p_client_contract_id;

  return v_total;
end;
$$;

create or replace function public.erp_client_contract_lines_recalc_total_trg()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.erp_recalculate_client_contract_total(old.company_id, old.client_contract_id);
    return old;
  end if;
  perform public.erp_recalculate_client_contract_total(new.company_id, new.client_contract_id);
  return new;
end;
$$;

drop trigger if exists erp_client_contract_lines_recalc_total on public.erp_client_contract_lines;
create trigger erp_client_contract_lines_recalc_total
after insert or update or delete on public.erp_client_contract_lines
for each row execute function public.erp_client_contract_lines_recalc_total_trg();

create or replace function public.erp_calculate_client_bill_totals(
  p_company_id text,
  p_progress_bill_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract_id uuid;
  v_indexation_pct numeric(8,4);
  v_retention_pct numeric(8,4);
  v_advance_payment_amount numeric(18,2);
  v_advance_repayment_pct numeric(8,4);
  v_submitted_total numeric(18,2);
  v_approved_total numeric(18,2);
  v_indexed_submitted numeric(18,2);
  v_indexed_approved numeric(18,2);
  v_retention_deducted numeric(18,2);
  v_prior_repayment numeric(18,2);
  v_target_repayment numeric(18,2);
  v_advance_repayment numeric(18,2);
  v_net_payable numeric(18,2);
begin
  select pb.client_contract_id
  into v_contract_id
  from public.erp_client_progress_bills pb
  where pb.id = p_progress_bill_id
    and pb.company_id = p_company_id;

  if v_contract_id is null then
    raise exception 'Progress bill not found';
  end if;

  select c.indexation_pct, c.retention_pct, c.advance_payment_amount, c.advance_repayment_pct
  into v_indexation_pct, v_retention_pct, v_advance_payment_amount, v_advance_repayment_pct
  from public.erp_client_contracts c
  where c.id = v_contract_id
    and c.company_id = p_company_id;

  select
    coalesce(round(sum(submitted_amount), 2), 0),
    coalesce(round(sum(approved_amount), 2), 0)
  into v_submitted_total, v_approved_total
  from public.erp_client_progress_bill_lines
  where company_id = p_company_id
    and progress_bill_id = p_progress_bill_id;

  v_indexed_submitted := round(v_submitted_total * (1 + coalesce(v_indexation_pct, 0) / 100), 2);
  v_indexed_approved := round(v_approved_total * (1 + coalesce(v_indexation_pct, 0) / 100), 2);
  v_retention_deducted := round(v_indexed_approved * coalesce(v_retention_pct, 0) / 100, 2);

  select coalesce(sum(advance_repayment_amount), 0)
  into v_prior_repayment
  from public.erp_client_progress_bills
  where company_id = p_company_id
    and client_contract_id = v_contract_id
    and id <> p_progress_bill_id
    and status in ('SUBMITTED', 'PARTIALLY_APPROVED', 'APPROVED');

  v_target_repayment := round(v_indexed_approved * coalesce(v_advance_repayment_pct, 0) / 100, 2);
  v_advance_repayment := least(
    greatest(coalesce(v_advance_payment_amount, 0) - coalesce(v_prior_repayment, 0), 0),
    v_target_repayment
  );

  v_net_payable := round(v_indexed_approved - v_retention_deducted - v_advance_repayment, 2);

  update public.erp_client_progress_bills
  set submitted_total_amount = v_submitted_total,
      approved_total_amount = v_approved_total,
      indexed_submitted_amount = v_indexed_submitted,
      indexed_approved_amount = v_indexed_approved,
      retention_deducted_amount = v_retention_deducted,
      advance_repayment_amount = v_advance_repayment,
      net_approved_payable = v_net_payable
  where company_id = p_company_id
    and id = p_progress_bill_id;

  return jsonb_build_object(
    'submittedTotal', v_submitted_total,
    'approvedTotal', v_approved_total,
    'indexedSubmitted', v_indexed_submitted,
    'indexedApproved', v_indexed_approved,
    'retentionDeducted', v_retention_deducted,
    'advanceRepayment', v_advance_repayment,
    'netApprovedPayable', v_net_payable
  );
end;
$$;

create or replace function public.erp_copy_submitted_to_approved(
  p_company_id text,
  p_progress_bill_id uuid,
  p_skip_line_ids uuid[] default '{}'
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count int;
begin
  update public.erp_client_progress_bill_lines
  set approved_qty = submitted_qty,
      approved_amount = submitted_amount,
      approved_manual_override = false
  where company_id = p_company_id
    and progress_bill_id = p_progress_bill_id
    and not (id = any (coalesce(p_skip_line_ids, '{}')));

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

create or replace function public.erp_client_progress_bill_lines_recalc_totals_trg()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_bill_id uuid;
  v_company_id text;
begin
  if tg_op = 'DELETE' then
    v_bill_id := old.progress_bill_id;
    v_company_id := old.company_id;
  else
    v_bill_id := new.progress_bill_id;
    v_company_id := new.company_id;
  end if;

  perform public.erp_calculate_client_bill_totals(v_company_id, v_bill_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists erp_client_progress_bill_lines_recalc_totals on public.erp_client_progress_bill_lines;
create trigger erp_client_progress_bill_lines_recalc_totals
after insert or update or delete on public.erp_client_progress_bill_lines
for each row execute function public.erp_client_progress_bill_lines_recalc_totals_trg();

alter table public.erp_client_contracts enable row level security;
alter table public.erp_client_contract_lines enable row level security;
alter table public.erp_change_orders enable row level security;
alter table public.erp_client_progress_bills enable row level security;
alter table public.erp_client_progress_bill_lines enable row level security;

drop policy if exists erp_client_contracts_all_authenticated on public.erp_client_contracts;
create policy erp_client_contracts_all_authenticated on public.erp_client_contracts
  for all to authenticated using (true) with check (true);

drop policy if exists erp_client_contract_lines_all_authenticated on public.erp_client_contract_lines;
create policy erp_client_contract_lines_all_authenticated on public.erp_client_contract_lines
  for all to authenticated using (true) with check (true);

drop policy if exists erp_change_orders_all_authenticated on public.erp_change_orders;
create policy erp_change_orders_all_authenticated on public.erp_change_orders
  for all to authenticated using (true) with check (true);

drop policy if exists erp_client_progress_bills_all_authenticated on public.erp_client_progress_bills;
create policy erp_client_progress_bills_all_authenticated on public.erp_client_progress_bills
  for all to authenticated using (true) with check (true);

drop policy if exists erp_client_progress_bill_lines_all_authenticated on public.erp_client_progress_bill_lines;
create policy erp_client_progress_bill_lines_all_authenticated on public.erp_client_progress_bill_lines
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.erp_client_contracts to authenticated;
grant select, insert, update, delete on public.erp_client_contract_lines to authenticated;
grant select, insert, update, delete on public.erp_change_orders to authenticated;
grant select, insert, update, delete on public.erp_client_progress_bills to authenticated;
grant select, insert, update, delete on public.erp_client_progress_bill_lines to authenticated;

grant execute on function public.erp_recalculate_client_contract_total(text, uuid) to authenticated, service_role;
grant execute on function public.erp_calculate_client_bill_totals(text, uuid) to authenticated, service_role;
grant execute on function public.erp_copy_submitted_to_approved(text, uuid, uuid[]) to authenticated, service_role;

