-- Master Data — מקט״י ספק, יחידות מידה, מטבעות, הרחבת ספקים (Priority-style)

-- ---------------------------------------------------------------------------
-- currencies — מטבעות (מאסטר נפרד מ־erp_currencies לשכבת UI מאוחדת)
-- ---------------------------------------------------------------------------
create table if not exists public.currencies (
  id uuid primary key default gen_random_uuid(),
  code varchar(8) not null,
  name_he text not null,
  symbol text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint currencies_code_nonempty check (length(trim(code)) > 0),
  constraint currencies_code_upper check (code = upper(trim(code))),
  constraint currencies_code_unique unique (code)
);

create index if not exists currencies_code_idx on public.currencies (code);

drop trigger if exists currencies_updated_at on public.currencies;
create trigger currencies_updated_at
  before update on public.currencies
  for each row
  execute function public.set_updated_at();

insert into public.currencies (code, name_he, symbol)
values
  ('ILS', 'שקל חדש', '₪'),
  ('USD', 'דולר אמריקאי', '$'),
  ('EUR', 'יורו', '€'),
  ('GBP', 'לירה שטרלינג', '£')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- units_of_measure — יחידות מידה
-- ---------------------------------------------------------------------------
create table if not exists public.units_of_measure (
  id uuid primary key default gen_random_uuid(),
  code varchar(16) not null,
  description_he text not null,
  name_en text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uom_code_nonempty check (length(trim(code)) > 0),
  constraint uom_code_upper check (code = upper(trim(code))),
  constraint uom_code_unique unique (code)
);

create index if not exists uom_code_idx on public.units_of_measure (code);

drop trigger if exists units_of_measure_updated_at on public.units_of_measure;
create trigger units_of_measure_updated_at
  before update on public.units_of_measure
  for each row
  execute function public.set_updated_at();

insert into public.units_of_measure (code, description_he, name_en)
values
  ('LB', 'ליברה', 'Pound'),
  ('L', 'ליטר', 'Liter'),
  ('KG', 'קילוגרם', 'Kilogram'),
  ('HR', 'שעת עבודה', 'Work hour'),
  ('M', 'מטר', 'Meter'),
  ('M2', 'מ״ר', 'Square meter'),
  ('M3', 'מ״ק', 'Cubic meter'),
  ('EA', 'יחידה', 'Each'),
  ('TON', 'טון', 'Metric ton'),
  ('CM', 'סנטימטר', 'Centimeter'),
  ('MM', 'מילימטר', 'Millimeter'),
  ('BOX', 'ארגז', 'Box'),
  ('ROLL', 'גלילה', 'Roll')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- suppliers — הרחבה: תנאי תשלום + מטבע (tax_id כבר קיים בליבת מימון)
-- ---------------------------------------------------------------------------
alter table public.suppliers
  add column if not exists payment_term_code varchar(16) null
    references public.erp_payment_terms (code)
    on delete set null;

alter table public.suppliers
  add column if not exists currency_id uuid null
    references public.currencies (id)
    on delete set null;

create index if not exists suppliers_payment_term_code_idx
  on public.suppliers (payment_term_code)
  where payment_term_code is not null;

create index if not exists suppliers_currency_id_idx
  on public.suppliers (currency_id)
  where currency_id is not null;

comment on column public.suppliers.payment_term_code is 'תנאי תשלום — FK ל־erp_payment_terms.code';
comment on column public.suppliers.currency_id is 'מטבע ברירת מחדל לספק — FK ל־currencies';

-- ---------------------------------------------------------------------------
-- supplier_parts — מקט״י ספק (טבלה צהובה / Priority)
-- ---------------------------------------------------------------------------
create table if not exists public.supplier_parts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  part_number_supplier text not null default '',
  manufacturer text not null default '',
  supplier_name_text text not null default '',
  description_32_chars text not null default '',
  description_48_chars text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_parts_desc32_len check (char_length(description_32_chars) <= 32),
  constraint supplier_parts_desc48_len check (char_length(description_48_chars) <= 48)
);

create index if not exists supplier_parts_supplier_id_idx on public.supplier_parts (supplier_id);
create index if not exists supplier_parts_part_no_idx on public.supplier_parts (part_number_supplier);

drop trigger if exists supplier_parts_updated_at on public.supplier_parts;
create trigger supplier_parts_updated_at
  before update on public.supplier_parts
  for each row
  execute function public.set_updated_at();

comment on table public.supplier_parts is 'מקט״י ספק — מספר יצרן, תיאורים קצרים';

-- ---------------------------------------------------------------------------
-- RLS — אותה מדיניות כמו suppliers / כרטסת (משתמש מחובר)
-- ---------------------------------------------------------------------------
alter table public.currencies enable row level security;
alter table public.units_of_measure enable row level security;
alter table public.supplier_parts enable row level security;

grant select, insert, update, delete on public.currencies to authenticated;
grant select, insert, update, delete on public.units_of_measure to authenticated;
grant select, insert, update, delete on public.supplier_parts to authenticated;
grant all on public.currencies to service_role;
grant all on public.units_of_measure to service_role;
grant all on public.supplier_parts to service_role;

drop policy if exists currencies_all_authenticated on public.currencies;
create policy currencies_all_authenticated
  on public.currencies
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists uom_all_authenticated on public.units_of_measure;
create policy uom_all_authenticated
  on public.units_of_measure
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists supplier_parts_all_authenticated on public.supplier_parts;
create policy supplier_parts_all_authenticated
  on public.supplier_parts
  for all
  to authenticated
  using (true)
  with check (true);
