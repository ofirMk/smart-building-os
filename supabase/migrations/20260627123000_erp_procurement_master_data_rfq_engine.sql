-- ERP Procurement infrastructure extension:
-- item families hierarchy, supplier financials, vendor pricing agreements,
-- blanket purchase orders, RFQ + quote comparison engine.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_rfq_status') then
    create type public.erp_rfq_status as enum ('DRAFT', 'SENT', 'QUOTE', 'CLOSED', 'CANCELLED');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_vendor_quote_status') then
    create type public.erp_vendor_quote_status as enum ('DRAFT', 'SUBMITTED', 'REJECTED', 'ACCEPTED');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) Items + families hierarchy
-- ---------------------------------------------------------------------------
create table if not exists public.erp_item_family_types (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  code varchar(32) not null,
  name varchar(256) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_item_family_types_code_nonempty check (length(trim(code)) > 0),
  constraint erp_item_family_types_name_nonempty check (length(trim(name)) > 0),
  constraint erp_item_family_types_uq unique (company_id, code)
);

create index if not exists erp_item_family_types_company_idx
  on public.erp_item_family_types (company_id);

drop trigger if exists erp_item_family_types_updated_at on public.erp_item_family_types;
create trigger erp_item_family_types_updated_at
before update on public.erp_item_family_types
for each row execute function public.set_updated_at();

alter table public.erp_item_families
  add column if not exists company_id text references public.erp_companies (id) on delete restrict,
  add column if not exists family_type_id uuid references public.erp_item_family_types (id) on delete restrict,
  add column if not exists is_active boolean not null default true;

create unique index if not exists erp_item_families_company_code_uq
  on public.erp_item_families (company_id, code)
  where company_id is not null;

create index if not exists erp_item_families_company_type_idx
  on public.erp_item_families (company_id, family_type_id)
  where company_id is not null;

create or replace function public.erp_validate_item_family_type_company()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_type_company text;
begin
  if new.company_id is null and new.family_type_id is not null then
    raise exception 'company_id is required when family_type_id is provided';
  end if;

  if new.family_type_id is not null then
    select company_id
    into v_type_company
    from public.erp_item_family_types
    where id = new.family_type_id;

    if v_type_company is null then
      raise exception 'family_type_id not found';
    end if;

    if new.company_id is distinct from v_type_company then
      raise exception 'family_type_id must belong to same company_id';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists erp_item_families_validate_company on public.erp_item_families;
create trigger erp_item_families_validate_company
before insert or update on public.erp_item_families
for each row execute function public.erp_validate_item_family_type_company();

alter table public.erp_items
  add column if not exists is_inventory_managed boolean not null default false,
  add column if not exists min_order_quantity numeric(18,3) not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_items_min_order_quantity_nonnegative'
      and conrelid = 'public.erp_items'::regclass
  ) then
    alter table public.erp_items
      add constraint erp_items_min_order_quantity_nonnegative
      check (min_order_quantity >= 0);
  end if;
end $$;

alter table public.erp_md_items
  add column if not exists is_inventory_managed boolean not null default false,
  add column if not exists min_order_quantity numeric(18,3) not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_md_items_min_order_quantity_nonnegative'
      and conrelid = 'public.erp_md_items'::regclass
  ) then
    alter table public.erp_md_items
      add constraint erp_md_items_min_order_quantity_nonnegative
      check (min_order_quantity >= 0);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Supplier financials + bank accounts with audit + entry message
-- ---------------------------------------------------------------------------
alter table public.erp_md_suppliers
  add column if not exists vat_id text,
  add column if not exists withholding_tax_pct numeric(6,3),
  add column if not exists withholding_tax_valid_until date,
  add column if not exists currency_code varchar(8),
  add column if not exists entry_message text;

update public.erp_md_suppliers
set vat_id = coalesce(vat_id, tax_vat_id, tax_id)
where vat_id is null;

update public.erp_md_suppliers
set currency_code = coalesce(currency_code, 'ILS')
where currency_code is null or trim(currency_code) = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_md_suppliers_withholding_pct_range'
      and conrelid = 'public.erp_md_suppliers'::regclass
  ) then
    alter table public.erp_md_suppliers
      add constraint erp_md_suppliers_withholding_pct_range
      check (withholding_tax_pct is null or (withholding_tax_pct >= 0 and withholding_tax_pct <= 100));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_md_suppliers_currency_fk'
      and conrelid = 'public.erp_md_suppliers'::regclass
  ) then
    alter table public.erp_md_suppliers
      add constraint erp_md_suppliers_currency_fk
      foreign key (currency_code) references public.erp_currencies (code) on delete restrict;
  end if;
end $$;

create table if not exists public.erp_supplier_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  supplier_id uuid not null references public.erp_md_suppliers (id) on delete cascade,
  bank_name text not null,
  branch_number text null,
  account_number text not null,
  iban text null,
  swift text null,
  currency_code varchar(8) not null references public.erp_currencies (code) on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_supplier_bank_accounts_bank_nonempty check (length(trim(bank_name)) > 0),
  constraint erp_supplier_bank_accounts_account_nonempty check (length(trim(account_number)) > 0)
);

create index if not exists erp_supplier_bank_accounts_company_supplier_idx
  on public.erp_supplier_bank_accounts (company_id, supplier_id);

drop trigger if exists erp_supplier_bank_accounts_updated_at on public.erp_supplier_bank_accounts;
create trigger erp_supplier_bank_accounts_updated_at
before update on public.erp_supplier_bank_accounts
for each row execute function public.set_updated_at();

create table if not exists public.erp_supplier_bank_account_change_log (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  supplier_bank_account_id uuid null,
  operation text not null,
  old_row jsonb null,
  new_row jsonb null,
  changed_at timestamptz not null default now(),
  constraint erp_supplier_bank_account_change_log_operation_chk
    check (operation in ('INSERT', 'UPDATE', 'DELETE'))
);

create index if not exists erp_supplier_bank_account_change_log_company_idx
  on public.erp_supplier_bank_account_change_log (company_id, changed_at desc);

create or replace function public.erp_log_supplier_bank_account_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.erp_supplier_bank_account_change_log (
      company_id, supplier_bank_account_id, operation, old_row, new_row
    ) values (
      new.company_id, new.id, 'INSERT', null, to_jsonb(new)
    );
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.erp_supplier_bank_account_change_log (
      company_id, supplier_bank_account_id, operation, old_row, new_row
    ) values (
      new.company_id, new.id, 'UPDATE', to_jsonb(old), to_jsonb(new)
    );
    return new;
  else
    insert into public.erp_supplier_bank_account_change_log (
      company_id, supplier_bank_account_id, operation, old_row, new_row
    ) values (
      old.company_id, old.id, 'DELETE', to_jsonb(old), null
    );
    return old;
  end if;
end;
$$;

drop trigger if exists erp_supplier_bank_account_change_log_trg on public.erp_supplier_bank_accounts;
create trigger erp_supplier_bank_account_change_log_trg
after insert or update or delete on public.erp_supplier_bank_accounts
for each row execute function public.erp_log_supplier_bank_account_change();

create or replace function public.erp_supplier_message_on_entry(
  p_company_id text,
  p_supplier_id uuid
) returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'supplierId', s.id,
    'hasMessage', coalesce(length(trim(s.entry_message)) > 0, false),
    'message', coalesce(s.entry_message, ''),
    'currencyCode', s.currency_code,
    'withholdingTaxPct', s.withholding_tax_pct,
    'withholdingTaxValidUntil', s.withholding_tax_valid_until
  )
  from public.erp_md_suppliers s
  where s.company_id = p_company_id
    and s.id = p_supplier_id;
$$;

-- ---------------------------------------------------------------------------
-- 3) Agreements/pricing + blanket purchase orders
-- ---------------------------------------------------------------------------
create table if not exists public.erp_vendor_price_lists (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  supplier_id uuid not null references public.erp_md_suppliers (id) on delete restrict,
  list_code text not null,
  title text not null,
  valid_from date not null default (timezone('utc', now()))::date,
  valid_to date null,
  currency_code varchar(8) not null references public.erp_currencies (code) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_vendor_price_lists_code_nonempty check (length(trim(list_code)) > 0),
  constraint erp_vendor_price_lists_title_nonempty check (length(trim(title)) > 0),
  constraint erp_vendor_price_lists_validity check (valid_to is null or valid_to >= valid_from),
  constraint erp_vendor_price_lists_uq unique (company_id, supplier_id, list_code)
);

drop trigger if exists erp_vendor_price_lists_updated_at on public.erp_vendor_price_lists;
create trigger erp_vendor_price_lists_updated_at
before update on public.erp_vendor_price_lists
for each row execute function public.set_updated_at();

create table if not exists public.erp_vendor_price_list_items (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  price_list_id uuid not null references public.erp_vendor_price_lists (id) on delete cascade,
  item_sku varchar(64) not null references public.erp_items (sku) on delete restrict,
  min_quantity numeric(18,3) not null default 1,
  unit_price numeric(18,4) not null,
  valid_from date not null default (timezone('utc', now()))::date,
  valid_to date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_vendor_price_list_items_min_qty_nonnegative check (min_quantity >= 0),
  constraint erp_vendor_price_list_items_unit_price_nonnegative check (unit_price >= 0),
  constraint erp_vendor_price_list_items_validity check (valid_to is null or valid_to >= valid_from)
);

create index if not exists erp_vendor_price_list_items_company_lookup_idx
  on public.erp_vendor_price_list_items (company_id, item_sku, min_quantity, valid_from desc);

drop trigger if exists erp_vendor_price_list_items_updated_at on public.erp_vendor_price_list_items;
create trigger erp_vendor_price_list_items_updated_at
before update on public.erp_vendor_price_list_items
for each row execute function public.set_updated_at();

create table if not exists public.erp_blanket_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  supplier_id uuid not null references public.erp_md_suppliers (id) on delete restrict,
  blanket_number text not null,
  title text not null,
  status text not null default 'ACTIVE',
  valid_from date not null default (timezone('utc', now()))::date,
  valid_to date null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_blanket_purchase_orders_status_chk check (status in ('ACTIVE', 'CLOSED', 'CANCELLED')),
  constraint erp_blanket_purchase_orders_title_nonempty check (length(trim(title)) > 0),
  constraint erp_blanket_purchase_orders_validity check (valid_to is null or valid_to >= valid_from),
  constraint erp_blanket_purchase_orders_uq unique (company_id, blanket_number)
);

drop trigger if exists erp_blanket_purchase_orders_updated_at on public.erp_blanket_purchase_orders;
create trigger erp_blanket_purchase_orders_updated_at
before update on public.erp_blanket_purchase_orders
for each row execute function public.set_updated_at();

create table if not exists public.erp_blanket_purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  blanket_purchase_order_id uuid not null references public.erp_blanket_purchase_orders (id) on delete cascade,
  item_sku varchar(64) not null references public.erp_items (sku) on delete restrict,
  ordered_quantity numeric(18,3) not null,
  remaining_quantity numeric(18,3) not null,
  unit_price numeric(18,4) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_blanket_po_lines_ordered_nonnegative check (ordered_quantity >= 0),
  constraint erp_blanket_po_lines_remaining_nonnegative check (remaining_quantity >= 0),
  constraint erp_blanket_po_lines_remaining_le_ordered check (remaining_quantity <= ordered_quantity),
  constraint erp_blanket_po_lines_unit_price_nonnegative check (unit_price >= 0)
);

create index if not exists erp_blanket_po_lines_company_idx
  on public.erp_blanket_purchase_order_lines (company_id, blanket_purchase_order_id);

drop trigger if exists erp_blanket_po_lines_updated_at on public.erp_blanket_purchase_order_lines;
create trigger erp_blanket_po_lines_updated_at
before update on public.erp_blanket_purchase_order_lines
for each row execute function public.set_updated_at();

alter table public.erp_purchase_order_lines
  add column if not exists item_sku varchar(64),
  add column if not exists blanket_purchase_order_line_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_po_lines_item_sku_fk'
      and conrelid = 'public.erp_purchase_order_lines'::regclass
  ) then
    alter table public.erp_purchase_order_lines
      add constraint erp_po_lines_item_sku_fk
      foreign key (item_sku) references public.erp_items (sku) on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'erp_po_lines_blanket_line_fk'
      and conrelid = 'public.erp_purchase_order_lines'::regclass
  ) then
    alter table public.erp_purchase_order_lines
      add constraint erp_po_lines_blanket_line_fk
      foreign key (blanket_purchase_order_line_id)
      references public.erp_blanket_purchase_order_lines (id)
      on delete set null;
  end if;
end $$;

create or replace function public.erp_recalculate_blanket_line_balance(
  p_company_id text,
  p_blanket_line_id uuid
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ordered numeric(18,3);
  v_consumed numeric(18,3);
  v_remaining numeric(18,3);
begin
  select ordered_quantity
  into v_ordered
  from public.erp_blanket_purchase_order_lines
  where id = p_blanket_line_id
    and company_id = p_company_id;

  if v_ordered is null then
    return 0;
  end if;

  select coalesce(sum(pol.quantity), 0)
  into v_consumed
  from public.erp_purchase_order_lines pol
  join public.erp_purchase_orders po
    on po.id = pol.purchase_order_id
   and po.company_id = pol.company_id
  where pol.company_id = p_company_id
    and pol.blanket_purchase_order_line_id = p_blanket_line_id
    and po.status <> 'CANCELLED';

  v_remaining := greatest(v_ordered - v_consumed, 0);

  update public.erp_blanket_purchase_order_lines
  set remaining_quantity = v_remaining
  where id = p_blanket_line_id
    and company_id = p_company_id;

  return v_remaining;
end;
$$;

create or replace function public.erp_po_lines_sync_blanket_balance_trg()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.blanket_purchase_order_line_id is not null then
      perform public.erp_recalculate_blanket_line_balance(old.company_id, old.blanket_purchase_order_line_id);
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.blanket_purchase_order_line_id is not null
       and old.blanket_purchase_order_line_id is distinct from new.blanket_purchase_order_line_id then
      perform public.erp_recalculate_blanket_line_balance(old.company_id, old.blanket_purchase_order_line_id);
    end if;
  end if;

  if new.blanket_purchase_order_line_id is not null then
    perform public.erp_recalculate_blanket_line_balance(new.company_id, new.blanket_purchase_order_line_id);
  end if;

  return new;
end;
$$;

drop trigger if exists erp_po_lines_sync_blanket_balance on public.erp_purchase_order_lines;
create trigger erp_po_lines_sync_blanket_balance
after insert or update or delete on public.erp_purchase_order_lines
for each row execute function public.erp_po_lines_sync_blanket_balance_trg();

-- ---------------------------------------------------------------------------
-- 4) RFQ + quotes + compare view
-- ---------------------------------------------------------------------------
create table if not exists public.erp_rfqs (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  project_id uuid not null references public.erp_proj_projects (id) on delete restrict,
  rfq_number text not null,
  title text not null,
  status public.erp_rfq_status not null default 'DRAFT',
  valid_until date null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_rfqs_title_nonempty check (length(trim(title)) > 0),
  constraint erp_rfqs_uq unique (company_id, rfq_number)
);

drop trigger if exists erp_rfqs_updated_at on public.erp_rfqs;
create trigger erp_rfqs_updated_at
before update on public.erp_rfqs
for each row execute function public.set_updated_at();

create table if not exists public.erp_rfq_lines (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  rfq_id uuid not null references public.erp_rfqs (id) on delete cascade,
  item_sku varchar(64) null references public.erp_items (sku) on delete restrict,
  description text not null,
  quantity numeric(18,3) not null default 0,
  uom_code varchar(16) null references public.erp_uom (code) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_rfq_lines_description_nonempty check (length(trim(description)) > 0),
  constraint erp_rfq_lines_quantity_nonnegative check (quantity >= 0)
);

drop trigger if exists erp_rfq_lines_updated_at on public.erp_rfq_lines;
create trigger erp_rfq_lines_updated_at
before update on public.erp_rfq_lines
for each row execute function public.set_updated_at();

create table if not exists public.erp_vendor_quotes (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  rfq_id uuid not null references public.erp_rfqs (id) on delete cascade,
  supplier_id uuid not null references public.erp_md_suppliers (id) on delete restrict,
  quote_number text not null,
  status public.erp_vendor_quote_status not null default 'DRAFT',
  quoted_at timestamptz null,
  total_amount numeric(18,2) not null default 0,
  currency_code varchar(8) not null references public.erp_currencies (code) on delete restrict,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_vendor_quotes_uq unique (company_id, quote_number),
  constraint erp_vendor_quotes_total_nonnegative check (total_amount >= 0)
);

drop trigger if exists erp_vendor_quotes_updated_at on public.erp_vendor_quotes;
create trigger erp_vendor_quotes_updated_at
before update on public.erp_vendor_quotes
for each row execute function public.set_updated_at();

create table if not exists public.erp_vendor_quote_lines (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  vendor_quote_id uuid not null references public.erp_vendor_quotes (id) on delete cascade,
  rfq_line_id uuid not null references public.erp_rfq_lines (id) on delete cascade,
  min_quantity numeric(18,3) not null default 1,
  unit_price numeric(18,4) not null,
  valid_from date not null default (timezone('utc', now()))::date,
  valid_to date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_vendor_quote_lines_min_qty_nonnegative check (min_quantity >= 0),
  constraint erp_vendor_quote_lines_unit_price_nonnegative check (unit_price >= 0),
  constraint erp_vendor_quote_lines_validity check (valid_to is null or valid_to >= valid_from)
);

create unique index if not exists erp_vendor_quote_lines_tier_uq
  on public.erp_vendor_quote_lines (company_id, vendor_quote_id, rfq_line_id, min_quantity);

drop trigger if exists erp_vendor_quote_lines_updated_at on public.erp_vendor_quote_lines;
create trigger erp_vendor_quote_lines_updated_at
before update on public.erp_vendor_quote_lines
for each row execute function public.set_updated_at();

create or replace function public.erp_recalculate_vendor_quote_total(
  p_company_id text,
  p_vendor_quote_id uuid
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric(18,2);
begin
  select coalesce(round(sum(vql.unit_price * greatest(vql.min_quantity, rl.quantity)), 2), 0)
  into v_total
  from public.erp_vendor_quote_lines vql
  join public.erp_rfq_lines rl
    on rl.id = vql.rfq_line_id
   and rl.company_id = vql.company_id
  where vql.company_id = p_company_id
    and vql.vendor_quote_id = p_vendor_quote_id;

  update public.erp_vendor_quotes
  set total_amount = v_total
  where company_id = p_company_id
    and id = p_vendor_quote_id;

  return v_total;
end;
$$;

create or replace function public.erp_vendor_quote_lines_aggregate_trg()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_quote_id uuid;
  v_company_id text;
begin
  if tg_op = 'DELETE' then
    v_quote_id := old.vendor_quote_id;
    v_company_id := old.company_id;
  else
    v_quote_id := new.vendor_quote_id;
    v_company_id := new.company_id;
  end if;

  perform public.erp_recalculate_vendor_quote_total(v_company_id, v_quote_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists erp_vendor_quote_lines_aggregate on public.erp_vendor_quote_lines;
create trigger erp_vendor_quote_lines_aggregate
after insert or update or delete on public.erp_vendor_quote_lines
for each row execute function public.erp_vendor_quote_lines_aggregate_trg();

create or replace function public.erp_rfq_mark_quote_status_trg()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.erp_rfqs
  set status = 'QUOTE'
  where id = new.rfq_id
    and company_id = new.company_id
    and status in ('DRAFT', 'SENT');

  if new.status = 'DRAFT' then
    new.status := 'SUBMITTED';
  end if;
  if new.quoted_at is null then
    new.quoted_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists erp_vendor_quotes_mark_rfq_quote on public.erp_vendor_quotes;
create trigger erp_vendor_quotes_mark_rfq_quote
before insert on public.erp_vendor_quotes
for each row execute function public.erp_rfq_mark_quote_status_trg();

create or replace view public.erp_rfq_quote_comparison_vw as
select
  rq.company_id,
  rq.id as rfq_id,
  rq.rfq_number,
  rl.id as rfq_line_id,
  rl.description as rfq_line_description,
  rl.quantity as rfq_line_quantity,
  q.id as vendor_quote_id,
  q.quote_number,
  q.supplier_id,
  q.currency_code,
  q.status as quote_status,
  ql.min_quantity,
  ql.unit_price,
  round(ql.unit_price * greatest(ql.min_quantity, rl.quantity), 2) as extended_price,
  min(ql.unit_price) over (partition by rq.company_id, rq.id, rl.id) as best_unit_price,
  row_number() over (
    partition by rq.company_id, rq.id, rl.id
    order by ql.unit_price asc, q.created_at asc
  ) as price_rank
from public.erp_rfqs rq
join public.erp_rfq_lines rl
  on rl.rfq_id = rq.id
 and rl.company_id = rq.company_id
join public.erp_vendor_quotes q
  on q.rfq_id = rq.id
 and q.company_id = rq.company_id
join public.erp_vendor_quote_lines ql
  on ql.vendor_quote_id = q.id
 and ql.rfq_line_id = rl.id
 and ql.company_id = rq.company_id;

-- ---------------------------------------------------------------------------
-- RLS + grants (company_id isolation enforced by API + table shape)
-- ---------------------------------------------------------------------------
alter table public.erp_item_family_types enable row level security;
alter table public.erp_supplier_bank_accounts enable row level security;
alter table public.erp_supplier_bank_account_change_log enable row level security;
alter table public.erp_vendor_price_lists enable row level security;
alter table public.erp_vendor_price_list_items enable row level security;
alter table public.erp_blanket_purchase_orders enable row level security;
alter table public.erp_blanket_purchase_order_lines enable row level security;
alter table public.erp_rfqs enable row level security;
alter table public.erp_rfq_lines enable row level security;
alter table public.erp_vendor_quotes enable row level security;
alter table public.erp_vendor_quote_lines enable row level security;

drop policy if exists erp_item_family_types_all_authenticated on public.erp_item_family_types;
create policy erp_item_family_types_all_authenticated on public.erp_item_family_types
  for all to authenticated using (true) with check (true);

drop policy if exists erp_supplier_bank_accounts_all_authenticated on public.erp_supplier_bank_accounts;
create policy erp_supplier_bank_accounts_all_authenticated on public.erp_supplier_bank_accounts
  for all to authenticated using (true) with check (true);

drop policy if exists erp_supplier_bank_account_change_log_all_authenticated on public.erp_supplier_bank_account_change_log;
create policy erp_supplier_bank_account_change_log_all_authenticated on public.erp_supplier_bank_account_change_log
  for all to authenticated using (true) with check (true);

drop policy if exists erp_vendor_price_lists_all_authenticated on public.erp_vendor_price_lists;
create policy erp_vendor_price_lists_all_authenticated on public.erp_vendor_price_lists
  for all to authenticated using (true) with check (true);

drop policy if exists erp_vendor_price_list_items_all_authenticated on public.erp_vendor_price_list_items;
create policy erp_vendor_price_list_items_all_authenticated on public.erp_vendor_price_list_items
  for all to authenticated using (true) with check (true);

drop policy if exists erp_blanket_purchase_orders_all_authenticated on public.erp_blanket_purchase_orders;
create policy erp_blanket_purchase_orders_all_authenticated on public.erp_blanket_purchase_orders
  for all to authenticated using (true) with check (true);

drop policy if exists erp_blanket_purchase_order_lines_all_authenticated on public.erp_blanket_purchase_order_lines;
create policy erp_blanket_purchase_order_lines_all_authenticated on public.erp_blanket_purchase_order_lines
  for all to authenticated using (true) with check (true);

drop policy if exists erp_rfqs_all_authenticated on public.erp_rfqs;
create policy erp_rfqs_all_authenticated on public.erp_rfqs
  for all to authenticated using (true) with check (true);

drop policy if exists erp_rfq_lines_all_authenticated on public.erp_rfq_lines;
create policy erp_rfq_lines_all_authenticated on public.erp_rfq_lines
  for all to authenticated using (true) with check (true);

drop policy if exists erp_vendor_quotes_all_authenticated on public.erp_vendor_quotes;
create policy erp_vendor_quotes_all_authenticated on public.erp_vendor_quotes
  for all to authenticated using (true) with check (true);

drop policy if exists erp_vendor_quote_lines_all_authenticated on public.erp_vendor_quote_lines;
create policy erp_vendor_quote_lines_all_authenticated on public.erp_vendor_quote_lines
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.erp_item_family_types to authenticated;
grant select, insert, update, delete on public.erp_supplier_bank_accounts to authenticated;
grant select, insert, update, delete on public.erp_supplier_bank_account_change_log to authenticated;
grant select, insert, update, delete on public.erp_vendor_price_lists to authenticated;
grant select, insert, update, delete on public.erp_vendor_price_list_items to authenticated;
grant select, insert, update, delete on public.erp_blanket_purchase_orders to authenticated;
grant select, insert, update, delete on public.erp_blanket_purchase_order_lines to authenticated;
grant select, insert, update, delete on public.erp_rfqs to authenticated;
grant select, insert, update, delete on public.erp_rfq_lines to authenticated;
grant select, insert, update, delete on public.erp_vendor_quotes to authenticated;
grant select, insert, update, delete on public.erp_vendor_quote_lines to authenticated;
grant select on public.erp_rfq_quote_comparison_vw to authenticated;

grant execute on function public.erp_supplier_message_on_entry(text, uuid) to authenticated, service_role;
grant execute on function public.erp_recalculate_blanket_line_balance(text, uuid) to authenticated, service_role;
grant execute on function public.erp_recalculate_vendor_quote_total(text, uuid) to authenticated, service_role;

