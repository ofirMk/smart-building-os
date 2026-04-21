-- ERP Procurement BPM + variance/budget controls

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'erp_purchase_order_status'
  ) then
    create type public.erp_purchase_order_status as enum ('DRAFT', 'APPROVED', 'SENT', 'CLOSED', 'CANCELLED');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'erp_goods_receipt_status'
  ) then
    create type public.erp_goods_receipt_status as enum ('DRAFT', 'FINAL');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'erp_vendor_invoice_status'
  ) then
    create type public.erp_vendor_invoice_status as enum ('DRAFT', 'FINAL', 'CANCELLED');
  end if;
end $$;

create table if not exists public.erp_project_budget_lines (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  project_id uuid not null references public.erp_proj_projects (id) on delete restrict,
  budget_sub_chapter text not null,
  resource_id text not null,
  planned_amount numeric(18,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_project_budget_lines_planned_nonnegative check (planned_amount >= 0),
  constraint erp_project_budget_lines_uq unique (company_id, project_id, budget_sub_chapter, resource_id)
);

create table if not exists public.erp_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  project_id uuid not null references public.erp_proj_projects (id) on delete restrict,
  supplier_id uuid not null references public.erp_md_suppliers (id) on delete restrict,
  po_number text not null,
  title text not null,
  status public.erp_purchase_order_status not null default 'DRAFT',
  total_amount numeric(18,2) not null default 0,
  issued_at date null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_purchase_orders_title_nonempty check (length(trim(title)) > 0),
  constraint erp_purchase_orders_total_nonnegative check (total_amount >= 0),
  constraint erp_purchase_orders_uq unique (company_id, po_number)
);

create table if not exists public.erp_purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  purchase_order_id uuid not null references public.erp_purchase_orders (id) on delete cascade,
  project_id uuid not null references public.erp_proj_projects (id) on delete restrict,
  budget_sub_chapter text not null,
  resource_id text not null,
  description text not null,
  quantity numeric(18,3) not null default 0,
  unit_price numeric(18,2) not null default 0,
  total_price numeric(18,2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_purchase_order_lines_description_nonempty check (length(trim(description)) > 0),
  constraint erp_purchase_order_lines_qty_nonnegative check (quantity >= 0),
  constraint erp_purchase_order_lines_price_nonnegative check (unit_price >= 0)
);

create table if not exists public.erp_goods_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  purchase_order_id uuid not null references public.erp_purchase_orders (id) on delete restrict,
  gr_number text not null,
  status public.erp_goods_receipt_status not null default 'DRAFT',
  receipt_date date null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_goods_receipts_uq unique (company_id, gr_number)
);

create table if not exists public.erp_goods_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  goods_receipt_id uuid not null references public.erp_goods_receipts (id) on delete cascade,
  purchase_order_line_id uuid null references public.erp_purchase_order_lines (id) on delete set null,
  project_id uuid not null references public.erp_proj_projects (id) on delete restrict,
  budget_sub_chapter text not null,
  resource_id text not null,
  description text not null,
  quantity numeric(18,3) not null default 0,
  unit_price numeric(18,2) not null default 0,
  total_price numeric(18,2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_goods_receipt_lines_description_nonempty check (length(trim(description)) > 0),
  constraint erp_goods_receipt_lines_qty_nonnegative check (quantity >= 0),
  constraint erp_goods_receipt_lines_price_nonnegative check (unit_price >= 0)
);

create table if not exists public.erp_vendor_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  supplier_id uuid not null references public.erp_md_suppliers (id) on delete restrict,
  invoice_number text not null,
  status public.erp_vendor_invoice_status not null default 'DRAFT',
  invoice_date date null,
  total_amount numeric(18,2) not null default 0,
  price_variance_amount numeric(18,2) not null default 0,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_vendor_invoices_total_nonnegative check (total_amount >= 0),
  constraint erp_vendor_invoices_uq unique (company_id, invoice_number)
);

create table if not exists public.erp_vendor_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  vendor_invoice_id uuid not null references public.erp_vendor_invoices (id) on delete cascade,
  goods_receipt_line_id uuid null references public.erp_goods_receipt_lines (id) on delete set null,
  project_id uuid not null references public.erp_proj_projects (id) on delete restrict,
  budget_sub_chapter text not null,
  resource_id text not null,
  description text not null,
  quantity numeric(18,3) not null default 0,
  unit_price numeric(18,2) not null default 0,
  total_price numeric(18,2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_vendor_invoice_lines_description_nonempty check (length(trim(description)) > 0),
  constraint erp_vendor_invoice_lines_qty_nonnegative check (quantity >= 0),
  constraint erp_vendor_invoice_lines_price_nonnegative check (unit_price >= 0)
);

create table if not exists public.erp_vendor_invoice_receipts (
  company_id text not null references public.erp_companies (id) on delete restrict,
  vendor_invoice_id uuid not null references public.erp_vendor_invoices (id) on delete cascade,
  goods_receipt_id uuid not null references public.erp_goods_receipts (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (company_id, vendor_invoice_id, goods_receipt_id)
);

create table if not exists public.erp_procurement_status_events (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  from_status text null,
  to_status text not null,
  action_name text not null default 'STATUS_CHANGE',
  created_at timestamptz not null default now()
);

create index if not exists erp_po_company_idx on public.erp_purchase_orders (company_id, status);
create index if not exists erp_po_lines_company_po_idx on public.erp_purchase_order_lines (company_id, purchase_order_id);
create index if not exists erp_gr_company_idx on public.erp_goods_receipts (company_id, status);
create index if not exists erp_gr_lines_company_gr_idx on public.erp_goods_receipt_lines (company_id, goods_receipt_id);
create index if not exists erp_vi_company_idx on public.erp_vendor_invoices (company_id, status);
create index if not exists erp_vi_lines_company_invoice_idx on public.erp_vendor_invoice_lines (company_id, vendor_invoice_id);
create index if not exists erp_proc_status_events_entity_idx on public.erp_procurement_status_events (company_id, entity_type, entity_id, created_at desc);

create or replace function public.erp_validate_procurement_budget_line(
  p_company_id text,
  p_project_id uuid,
  p_budget_sub_chapter text,
  p_resource_id text,
  p_amount numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_planned numeric(18,2);
  v_existing_committed numeric(18,2);
begin
  select planned_amount
  into v_planned
  from public.erp_project_budget_lines
  where company_id = p_company_id
    and project_id = p_project_id
    and budget_sub_chapter = p_budget_sub_chapter
    and resource_id = p_resource_id
  limit 1;

  if v_planned is null then
    raise exception 'Budget line missing for project/resource/sub-chapter';
  end if;

  select coalesce(sum(pol.total_price), 0)
  into v_existing_committed
  from public.erp_purchase_order_lines pol
  join public.erp_purchase_orders po on po.id = pol.purchase_order_id
  where pol.company_id = p_company_id
    and pol.project_id = p_project_id
    and pol.budget_sub_chapter = p_budget_sub_chapter
    and pol.resource_id = p_resource_id
    and po.status <> 'CANCELLED';

  if (v_existing_committed + coalesce(p_amount, 0)) > v_planned then
    raise exception 'Budget exceeded for project/resource/sub-chapter';
  end if;
end;
$$;

create or replace function public.erp_po_block_mutation_when_locked()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status in ('APPROVED', 'SENT') and new.status = old.status then
    raise exception 'PO in APPROVED/SENT cannot be modified without reverting to DRAFT';
  end if;
  return new;
end;
$$;

create or replace function public.erp_po_lines_only_draft()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_po_status public.erp_purchase_order_status;
  v_company_id text;
begin
  if tg_op = 'DELETE' then
    v_company_id := old.company_id;
    select status into v_po_status from public.erp_purchase_orders where id = old.purchase_order_id and company_id = old.company_id;
  else
    v_company_id := new.company_id;
    select status into v_po_status from public.erp_purchase_orders where id = new.purchase_order_id and company_id = new.company_id;
    perform public.erp_validate_procurement_budget_line(
      new.company_id,
      new.project_id,
      new.budget_sub_chapter,
      new.resource_id,
      new.quantity * new.unit_price
    );
  end if;

  if v_po_status is null then
    raise exception 'Parent PO not found';
  end if;

  if v_po_status <> 'DRAFT' then
    raise exception 'PO lines can be modified only when PO is DRAFT';
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.erp_validate_gr_invoice_budget_line()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.erp_validate_procurement_budget_line(
    new.company_id,
    new.project_id,
    new.budget_sub_chapter,
    new.resource_id,
    new.quantity * new.unit_price
  );
  return new;
end;
$$;

create or replace function public.erp_require_final_receipt_for_invoice_link()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status public.erp_goods_receipt_status;
begin
  select status
  into v_status
  from public.erp_goods_receipts
  where id = new.goods_receipt_id
    and company_id = new.company_id;

  if v_status is distinct from 'FINAL' then
    raise exception 'Only FINAL goods receipts can be linked to invoices';
  end if;

  return new;
end;
$$;

create or replace function public.erp_log_procurement_status_event()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_entity_type text;
begin
  if tg_table_name = 'erp_purchase_orders' then
    v_entity_type := 'PURCHASE_ORDER';
  elsif tg_table_name = 'erp_goods_receipts' then
    v_entity_type := 'GOODS_RECEIPT';
  else
    v_entity_type := 'VENDOR_INVOICE';
  end if;

  if tg_op = 'INSERT' then
    insert into public.erp_procurement_status_events (
      company_id,
      entity_type,
      entity_id,
      from_status,
      to_status,
      action_name
    ) values (
      new.company_id,
      v_entity_type,
      new.id,
      null,
      new.status::text,
      'CREATED'
    );
  elsif new.status is distinct from old.status then
    insert into public.erp_procurement_status_events (
      company_id,
      entity_type,
      entity_id,
      from_status,
      to_status,
      action_name
    ) values (
      new.company_id,
      v_entity_type,
      new.id,
      old.status::text,
      new.status::text,
      'STATUS_CHANGE'
    );
  end if;

  return new;
end;
$$;

create or replace function public.erp_recalculate_po_total(
  p_company_id text,
  p_po_id uuid
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
  from public.erp_purchase_order_lines
  where company_id = p_company_id and purchase_order_id = p_po_id;

  update public.erp_purchase_orders
  set total_amount = v_total
  where company_id = p_company_id and id = p_po_id;

  return v_total;
end;
$$;

create or replace function public.erp_recalculate_invoice_variance(
  p_company_id text,
  p_invoice_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_total numeric(18,2);
  v_receipt_total numeric(18,2);
  v_variance numeric(18,2);
begin
  select coalesce(round(sum(vil.total_price), 2), 0)
  into v_invoice_total
  from public.erp_vendor_invoice_lines vil
  where vil.company_id = p_company_id and vil.vendor_invoice_id = p_invoice_id;

  select coalesce(round(sum(grl.total_price), 2), 0)
  into v_receipt_total
  from public.erp_vendor_invoice_receipts vir
  join public.erp_goods_receipt_lines grl
    on grl.goods_receipt_id = vir.goods_receipt_id
   and grl.company_id = vir.company_id
  where vir.company_id = p_company_id
    and vir.vendor_invoice_id = p_invoice_id;

  v_variance := round(v_invoice_total - v_receipt_total, 2);

  update public.erp_vendor_invoices
  set total_amount = v_invoice_total,
      price_variance_amount = v_variance
  where company_id = p_company_id
    and id = p_invoice_id;

  return jsonb_build_object(
    'invoiceTotal', v_invoice_total,
    'receiptTotal', v_receipt_total,
    'priceVariance', v_variance
  );
end;
$$;

create or replace function public.erp_po_lines_recalculate_total_trg()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_company_id text;
  v_po_id uuid;
begin
  if tg_op = 'DELETE' then
    v_company_id := old.company_id;
    v_po_id := old.purchase_order_id;
  else
    v_company_id := new.company_id;
    v_po_id := new.purchase_order_id;
  end if;

  perform public.erp_recalculate_po_total(v_company_id, v_po_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists erp_purchase_orders_lock_mutation on public.erp_purchase_orders;
create trigger erp_purchase_orders_lock_mutation
before update on public.erp_purchase_orders
for each row
execute function public.erp_po_block_mutation_when_locked();

drop trigger if exists erp_purchase_order_lines_only_draft on public.erp_purchase_order_lines;
create trigger erp_purchase_order_lines_only_draft
before insert or update or delete on public.erp_purchase_order_lines
for each row
execute function public.erp_po_lines_only_draft();

drop trigger if exists erp_gr_lines_budget_validation on public.erp_goods_receipt_lines;
create trigger erp_gr_lines_budget_validation
before insert or update on public.erp_goods_receipt_lines
for each row
execute function public.erp_validate_gr_invoice_budget_line();

drop trigger if exists erp_invoice_lines_budget_validation on public.erp_vendor_invoice_lines;
create trigger erp_invoice_lines_budget_validation
before insert or update on public.erp_vendor_invoice_lines
for each row
execute function public.erp_validate_gr_invoice_budget_line();

drop trigger if exists erp_vendor_invoice_receipts_final_only on public.erp_vendor_invoice_receipts;
create trigger erp_vendor_invoice_receipts_final_only
before insert or update on public.erp_vendor_invoice_receipts
for each row
execute function public.erp_require_final_receipt_for_invoice_link();

drop trigger if exists erp_po_lines_recalculate_total on public.erp_purchase_order_lines;
create trigger erp_po_lines_recalculate_total
after insert or update or delete on public.erp_purchase_order_lines
for each row
execute function public.erp_po_lines_recalculate_total_trg();

drop trigger if exists erp_po_status_event on public.erp_purchase_orders;
create trigger erp_po_status_event
after insert or update on public.erp_purchase_orders
for each row
execute function public.erp_log_procurement_status_event();

drop trigger if exists erp_gr_status_event on public.erp_goods_receipts;
create trigger erp_gr_status_event
after insert or update on public.erp_goods_receipts
for each row
execute function public.erp_log_procurement_status_event();

drop trigger if exists erp_invoice_status_event on public.erp_vendor_invoices;
create trigger erp_invoice_status_event
after insert or update on public.erp_vendor_invoices
for each row
execute function public.erp_log_procurement_status_event();

alter table public.erp_project_budget_lines enable row level security;
alter table public.erp_purchase_orders enable row level security;
alter table public.erp_purchase_order_lines enable row level security;
alter table public.erp_goods_receipts enable row level security;
alter table public.erp_goods_receipt_lines enable row level security;
alter table public.erp_vendor_invoices enable row level security;
alter table public.erp_vendor_invoice_lines enable row level security;
alter table public.erp_vendor_invoice_receipts enable row level security;
alter table public.erp_procurement_status_events enable row level security;

drop policy if exists erp_purchase_orders_all_authenticated on public.erp_purchase_orders;
create policy erp_purchase_orders_all_authenticated on public.erp_purchase_orders
  for all to authenticated using (true) with check (true);

drop policy if exists erp_purchase_order_lines_all_authenticated on public.erp_purchase_order_lines;
create policy erp_purchase_order_lines_all_authenticated on public.erp_purchase_order_lines
  for all to authenticated using (true) with check (true);

drop policy if exists erp_goods_receipts_all_authenticated on public.erp_goods_receipts;
create policy erp_goods_receipts_all_authenticated on public.erp_goods_receipts
  for all to authenticated using (true) with check (true);

drop policy if exists erp_goods_receipt_lines_all_authenticated on public.erp_goods_receipt_lines;
create policy erp_goods_receipt_lines_all_authenticated on public.erp_goods_receipt_lines
  for all to authenticated using (true) with check (true);

drop policy if exists erp_vendor_invoices_all_authenticated on public.erp_vendor_invoices;
create policy erp_vendor_invoices_all_authenticated on public.erp_vendor_invoices
  for all to authenticated using (true) with check (true);

drop policy if exists erp_vendor_invoice_lines_all_authenticated on public.erp_vendor_invoice_lines;
create policy erp_vendor_invoice_lines_all_authenticated on public.erp_vendor_invoice_lines
  for all to authenticated using (true) with check (true);

drop policy if exists erp_vendor_invoice_receipts_all_authenticated on public.erp_vendor_invoice_receipts;
create policy erp_vendor_invoice_receipts_all_authenticated on public.erp_vendor_invoice_receipts
  for all to authenticated using (true) with check (true);

drop policy if exists erp_project_budget_lines_all_authenticated on public.erp_project_budget_lines;
create policy erp_project_budget_lines_all_authenticated on public.erp_project_budget_lines
  for all to authenticated using (true) with check (true);

drop policy if exists erp_procurement_status_events_all_authenticated on public.erp_procurement_status_events;
create policy erp_procurement_status_events_all_authenticated on public.erp_procurement_status_events
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.erp_project_budget_lines to authenticated;
grant select, insert, update, delete on public.erp_purchase_orders to authenticated;
grant select, insert, update, delete on public.erp_purchase_order_lines to authenticated;
grant select, insert, update, delete on public.erp_goods_receipts to authenticated;
grant select, insert, update, delete on public.erp_goods_receipt_lines to authenticated;
grant select, insert, update, delete on public.erp_vendor_invoices to authenticated;
grant select, insert, update, delete on public.erp_vendor_invoice_lines to authenticated;
grant select, insert, update, delete on public.erp_vendor_invoice_receipts to authenticated;
grant select, insert, update, delete on public.erp_procurement_status_events to authenticated;
grant execute on function public.erp_validate_procurement_budget_line(text, uuid, text, text, numeric) to authenticated, service_role;
grant execute on function public.erp_recalculate_po_total(text, uuid) to authenticated, service_role;
grant execute on function public.erp_recalculate_invoice_variance(text, uuid) to authenticated, service_role;

