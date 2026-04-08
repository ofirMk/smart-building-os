-- Holden ERP — רכש ומלאי: מטבעות, יחידות, משפחות, פריטים, מק״ט ספק, מחירונים

-- ---------------------------------------------------------------------------
-- erp_currencies
-- ---------------------------------------------------------------------------
create table if not exists public.erp_currencies (
  code varchar(8) not null,
  name varchar(128) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_currencies_pkey primary key (code)
);

drop trigger if exists erp_currencies_updated_at on public.erp_currencies;
create trigger erp_currencies_updated_at
  before update on public.erp_currencies
  for each row
  execute function public.set_updated_at();

insert into public.erp_currencies (code, name)
values
  ('ILS', 'שקל חדש'),
  ('USD', 'דולר אמריקאי'),
  ('EUR', 'יורו')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- erp_uom
-- ---------------------------------------------------------------------------
create table if not exists public.erp_uom (
  code varchar(16) not null,
  name varchar(128) not null,
  english_name varchar(128) not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_uom_pkey primary key (code)
);

drop trigger if exists erp_uom_updated_at on public.erp_uom;
create trigger erp_uom_updated_at
  before update on public.erp_uom
  for each row
  execute function public.set_updated_at();

insert into public.erp_uom (code, name, english_name)
values
  ('EA', 'יחידה', 'Each'),
  ('M', 'מטר', 'Meter'),
  ('M2', 'מ״׳ר', 'Square meter'),
  ('KG', 'ק״ג', 'Kilogram')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- erp_item_families
-- ---------------------------------------------------------------------------
create table if not exists public.erp_item_families (
  code varchar(32) not null,
  name varchar(256) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_item_families_pkey primary key (code)
);

drop trigger if exists erp_item_families_updated_at on public.erp_item_families;
create trigger erp_item_families_updated_at
  before update on public.erp_item_families
  for each row
  execute function public.set_updated_at();

insert into public.erp_item_families (code, name)
values
  ('GEN', 'כללי'),
  ('MAT', 'חומרים'),
  ('EQP', 'ציוד')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- erp_items
-- ---------------------------------------------------------------------------
create table if not exists public.erp_items (
  sku varchar(64) not null,
  description varchar(512) not null default '',
  family_code varchar(32) not null references public.erp_item_families (code) on delete restrict,
  uom_code varchar(16) not null references public.erp_uom (code) on delete restrict,
  base_price numeric(18, 4) not null default 0
    constraint erp_items_base_price_nonneg check (base_price >= 0),
  currency_code varchar(8) not null references public.erp_currencies (code) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_items_pkey primary key (sku)
);

create index if not exists erp_items_family_code_idx on public.erp_items (family_code);
create index if not exists erp_items_active_idx on public.erp_items (is_active) where is_active = true;

drop trigger if exists erp_items_updated_at on public.erp_items;
create trigger erp_items_updated_at
  before update on public.erp_items
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- erp_supplier_items (מק״ט ספק — חיבור לישות ספק)
-- ---------------------------------------------------------------------------
create table if not exists public.erp_supplier_items (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.entities (id) on delete cascade,
  internal_sku varchar(64) not null references public.erp_items (sku) on delete cascade,
  supplier_sku varchar(128) not null default '',
  supplier_item_description varchar(512) not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_supplier_items_supplier_idx on public.erp_supplier_items (supplier_id);
create index if not exists erp_supplier_items_internal_sku_idx on public.erp_supplier_items (internal_sku);
create unique index if not exists erp_supplier_items_supplier_internal_uq
  on public.erp_supplier_items (supplier_id, internal_sku);

drop trigger if exists erp_supplier_items_updated_at on public.erp_supplier_items;
create trigger erp_supplier_items_updated_at
  before update on public.erp_supplier_items
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- erp_supplier_price_lists
-- ---------------------------------------------------------------------------
create table if not exists public.erp_supplier_price_lists (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.entities (id) on delete cascade,
  price_list_code varchar(32) not null default 'DEFAULT',
  item_sku varchar(64) not null references public.erp_items (sku) on delete cascade,
  price numeric(18, 4) not null
    constraint erp_spl_price_nonneg check (price >= 0),
  currency_code varchar(8) not null references public.erp_currencies (code) on delete restrict,
  discount_pct numeric(8, 4) not null default 0
    constraint erp_spl_discount_range check (discount_pct >= 0 and discount_pct <= 100),
  valid_from date not null default (timezone('utc', now()))::date,
  valid_to date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_spl_valid_range_chk check (valid_to is null or valid_to >= valid_from)
);

create index if not exists erp_spl_supplier_idx on public.erp_supplier_price_lists (supplier_id);
create index if not exists erp_spl_item_sku_idx on public.erp_supplier_price_lists (item_sku);
create index if not exists erp_spl_validity_idx
  on public.erp_supplier_price_lists (item_sku, valid_from, valid_to);

drop trigger if exists erp_supplier_price_lists_updated_at on public.erp_supplier_price_lists;
create trigger erp_supplier_price_lists_updated_at
  before update on public.erp_supplier_price_lists
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (קריאה למשתמשים מחוברים; כתיבה למנהלים)
-- ---------------------------------------------------------------------------
alter table public.erp_currencies enable row level security;
alter table public.erp_uom enable row level security;
alter table public.erp_item_families enable row level security;
alter table public.erp_items enable row level security;
alter table public.erp_supplier_items enable row level security;
alter table public.erp_supplier_price_lists enable row level security;

drop policy if exists erp_currencies_select_authenticated on public.erp_currencies;
create policy erp_currencies_select_authenticated on public.erp_currencies for select to authenticated using (true);
drop policy if exists erp_uom_select_authenticated on public.erp_uom;
create policy erp_uom_select_authenticated on public.erp_uom for select to authenticated using (true);
drop policy if exists erp_item_families_select_authenticated on public.erp_item_families;
create policy erp_item_families_select_authenticated on public.erp_item_families for select to authenticated using (true);
drop policy if exists erp_items_select_authenticated on public.erp_items;
create policy erp_items_select_authenticated on public.erp_items for select to authenticated using (true);
drop policy if exists erp_supplier_items_select_authenticated on public.erp_supplier_items;
create policy erp_supplier_items_select_authenticated on public.erp_supplier_items for select to authenticated using (true);
drop policy if exists erp_supplier_price_lists_select_authenticated on public.erp_supplier_price_lists;
create policy erp_supplier_price_lists_select_authenticated on public.erp_supplier_price_lists for select to authenticated using (true);

drop policy if exists erp_ref_write_admin on public.erp_currencies;
create policy erp_ref_write_admin on public.erp_currencies for all to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'::public.user_role)
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'::public.user_role)
);

drop policy if exists erp_uom_write_admin on public.erp_uom;
create policy erp_uom_write_admin on public.erp_uom for all to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'::public.user_role)
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'::public.user_role)
);

drop policy if exists erp_item_families_write_admin on public.erp_item_families;
create policy erp_item_families_write_admin on public.erp_item_families for all to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'::public.user_role)
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'::public.user_role)
);

drop policy if exists erp_items_write_finance on public.erp_items;
create policy erp_items_write_finance on public.erp_items for all to authenticated using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin'::public.user_role or coalesce(p.marker_ofek_full_project_access, false) = true)
  )
) with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin'::public.user_role or coalesce(p.marker_ofek_full_project_access, false) = true)
  )
);

drop policy if exists erp_supplier_items_write_finance on public.erp_supplier_items;
create policy erp_supplier_items_write_finance on public.erp_supplier_items for all to authenticated using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin'::public.user_role or coalesce(p.marker_ofek_full_project_access, false) = true)
  )
) with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin'::public.user_role or coalesce(p.marker_ofek_full_project_access, false) = true)
  )
);

drop policy if exists erp_supplier_price_lists_write_finance on public.erp_supplier_price_lists;
create policy erp_supplier_price_lists_write_finance on public.erp_supplier_price_lists for all to authenticated using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin'::public.user_role or coalesce(p.marker_ofek_full_project_access, false) = true)
  )
) with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin'::public.user_role or coalesce(p.marker_ofek_full_project_access, false) = true)
  )
);

grant select on public.erp_currencies, public.erp_uom, public.erp_item_families, public.erp_items,
  public.erp_supplier_items, public.erp_supplier_price_lists to authenticated;
grant select, insert, update, delete on public.erp_currencies, public.erp_uom, public.erp_item_families,
  public.erp_items, public.erp_supplier_items, public.erp_supplier_price_lists to authenticated;
grant all on public.erp_currencies, public.erp_uom, public.erp_item_families, public.erp_items,
  public.erp_supplier_items, public.erp_supplier_price_lists to service_role;
