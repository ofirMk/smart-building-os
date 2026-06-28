-- Priority Parity: Supplier Price Lists (מחירוני ספק) + Supplier Tasks (משימות לספק)
--
-- erp_supplier_price_lists  — header record per price list (מחירון ספק)
-- erp_supplier_price_list_items — product price lines (מחירי מוצרים)
-- erp_supplier_tasks         — task/todo items linked to a supplier

-- ──────────────────────────────────────────────────────────────────────
-- 1. מחירוני ספק – headers
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.erp_md_supplier_pricelist_hdrs (
  id                  uuid         primary key default gen_random_uuid(),
  company_id          text         not null,
  supplier_id         uuid         not null references public.erp_md_suppliers(id) on delete cascade,
  price_list_code     varchar(30)  not null,         -- קוד מחירון ספק
  description         text         null,              -- תאור מחירון ספק
  valid_from          date         not null,          -- ת. כניסה לתוקף
  currency_code       varchar(10)  null,              -- מטבע
  is_cancelled        boolean      not null default false,
  quote_valid_until   date         null,              -- הצעת מחיר בתוקף
  manufacturer_name   text         null,              -- שם מלא צרן
  manufacturer_short  text         null,              -- שם צרן
  price_multiplier    numeric(8,4) null default 1,    -- מספיל מחיר
  created_at          timestamptz  not null default now(),
  updated_at          timestamptz  not null default now(),
  constraint erp_md_supplier_pricelist_hdrs_code_uq
    unique (company_id, supplier_id, price_list_code)
);

create index if not exists erp_md_supplier_pricelist_hdrs_supplier_idx
  on public.erp_md_supplier_pricelist_hdrs (company_id, supplier_id);

comment on table  public.erp_md_supplier_pricelist_hdrs                   is 'מחירוני ספק — header records (Priority: SUPPRICELIST)';
comment on column public.erp_md_supplier_pricelist_hdrs.price_list_code   is 'קוד מחירון ספק (Priority: PLPRICELIST)';
comment on column public.erp_md_supplier_pricelist_hdrs.valid_from        is 'ת. כניסה לתוקף (Priority: FROMDATE)';
comment on column public.erp_md_supplier_pricelist_hdrs.is_cancelled      is 'מבוטל? (Priority: INACTIVE)';
comment on column public.erp_md_supplier_pricelist_hdrs.quote_valid_until is 'הצעת מחיר בתוקף (Priority: QTNDATE)';
comment on column public.erp_md_supplier_pricelist_hdrs.price_multiplier  is 'מספיל מחיר (Priority: PRICEFACTOR)';

-- RLS
alter table public.erp_md_supplier_pricelist_hdrs enable row level security;
drop policy if exists "tenant_isolation_supplier_pricelist_hdrs" on public.erp_md_supplier_pricelist_hdrs;
create policy "tenant_isolation_supplier_pricelist_hdrs"
  on public.erp_md_supplier_pricelist_hdrs
  using (company_id = current_setting('app.active_company_id', true));

-- ──────────────────────────────────────────────────────────────────────
-- 2. מחירי מוצרים – line items
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.erp_md_supplier_pricelist_items (
  id                    uuid         primary key default gen_random_uuid(),
  company_id            text         not null,
  price_list_id         uuid         not null references public.erp_md_supplier_pricelist_hdrs(id) on delete cascade,
  supplier_part_code    varchar(50)  not null,             -- פק"ס ספק/צרן
  description           text         null,                  -- תאור מק"ס ספק/צרן
  item_id               uuid         null references public.erp_md_items(id) on delete set null,
  quantity              numeric(12,4) not null default 1,   -- כמות
  unit_of_measure       varchar(10)  null,                  -- יח' מידה
  unit_price            numeric(14,4) not null default 0,   -- מחיר ליחידה
  discount_pct          numeric(8,4)  not null default 0,   -- הנחה %
  customer_price        numeric(14,4) null,                 -- מחיר ללקוח
  sort_order            int          null,
  created_at            timestamptz  not null default now(),
  updated_at            timestamptz  not null default now()
);

create index if not exists erp_md_supplier_pricelist_items_list_idx
  on public.erp_md_supplier_pricelist_items (price_list_id, sort_order);

comment on table  public.erp_md_supplier_pricelist_items                  is 'מחירי מוצרים בתוך מחירון ספק (Priority: SUPPRICE)';
comment on column public.erp_md_supplier_pricelist_items.supplier_part_code is 'פק"ס ספק/צרן (Priority: PARTNAME)';
comment on column public.erp_md_supplier_pricelist_items.unit_price         is 'מחיר ליחידה (Priority: PRICE)';
comment on column public.erp_md_supplier_pricelist_items.discount_pct       is 'הנחה % (Priority: DISCPER)';
comment on column public.erp_md_supplier_pricelist_items.customer_price     is 'מחיר ללקוח (Priority: CUSTPRICE)';

-- RLS
alter table public.erp_md_supplier_pricelist_items enable row level security;
drop policy if exists "tenant_isolation_supplier_pricelist_items" on public.erp_md_supplier_pricelist_items;
create policy "tenant_isolation_supplier_pricelist_items"
  on public.erp_md_supplier_pricelist_items
  using (company_id = current_setting('app.active_company_id', true));

-- ──────────────────────────────────────────────────────────────────────
-- 3. משימות לספק – supplier tasks / to-dos
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.erp_supplier_tasks (
  id           uuid        primary key default gen_random_uuid(),
  company_id   text        not null,
  supplier_id  uuid        not null references public.erp_md_suppliers(id) on delete cascade,
  task_date    date        not null default current_date,   -- *מתאריך
  assigned_to  text        null,                             -- *לטיפול
  summary      text        null,                             -- תקציר המשימה
  status       varchar(20) not null default 'OPEN',         -- OPEN / DONE / CANCELLED
  is_completed boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists erp_supplier_tasks_supplier_idx
  on public.erp_supplier_tasks (company_id, supplier_id, task_date desc);

comment on table  public.erp_supplier_tasks             is 'משימות לספק (Priority: SUPPTODO)';
comment on column public.erp_supplier_tasks.task_date   is '*מתאריך (Priority: TDATE)';
comment on column public.erp_supplier_tasks.assigned_to is '*לטיפול — שם משתמש (Priority: OWNERLOGIN)';
comment on column public.erp_supplier_tasks.summary     is 'תקציר המשימה (Priority: SUBJECT)';
comment on column public.erp_supplier_tasks.status      is 'סטטוס: OPEN/DONE/CANCELLED';

-- RLS
alter table public.erp_supplier_tasks enable row level security;
drop policy if exists "tenant_isolation_supplier_tasks" on public.erp_supplier_tasks;
create policy "tenant_isolation_supplier_tasks"
  on public.erp_supplier_tasks
  using (company_id = current_setting('app.active_company_id', true));
