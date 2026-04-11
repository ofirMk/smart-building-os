-- Customer sales orders (הזמנת לקוח) — master/detail; links to client entity, optional project, catalog items

create type public.mo_sales_order_status as enum ('draft', 'confirmed', 'cancelled');

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  client_entity_id uuid not null references public.entities (id) on delete restrict,
  project_id uuid null references public.projects (id) on delete set null,
  order_number text null,
  order_date date not null default (timezone('utc', now())::date),
  status public.mo_sales_order_status not null default 'draft',
  total_amount numeric(18, 2) not null default 0
    constraint sales_orders_total_nonneg check (total_amount >= 0),
  internal_notes text null,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references auth.users (id) on delete set null
);

comment on table public.sales_orders is 'הזמנת לקוח — כותרת; client_entity_id → entities (לקוח)';

create index if not exists sales_orders_client_idx on public.sales_orders (client_entity_id);
create index if not exists sales_orders_project_idx on public.sales_orders (project_id) where project_id is not null;
create index if not exists sales_orders_order_date_idx on public.sales_orders (order_date desc);

create unique index if not exists sales_orders_order_number_uidx
  on public.sales_orders (order_number)
  where order_number is not null and length(trim(order_number)) > 0 and is_deleted = false;

drop trigger if exists sales_orders_updated_at on public.sales_orders;
create trigger sales_orders_updated_at
  before update on public.sales_orders
  for each row execute function public.set_updated_at();

create table if not exists public.sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders (id) on delete cascade,
  item_catalog_id uuid not null references public.items_catalog (id) on delete restrict,
  sku text null,
  description text not null default '',
  quantity numeric(18, 4) not null
    constraint sales_order_lines_qty_pos check (quantity > 0),
  unit_price numeric(18, 4) not null
    constraint sales_order_lines_unit_nonneg check (unit_price >= 0),
  line_total numeric(18, 2) not null
    constraint sales_order_lines_line_total_nonneg check (line_total >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists sales_order_lines_order_idx
  on public.sales_order_lines (sales_order_id, sort_order);

comment on table public.sales_order_lines is 'שורות הזמנת לקוח — קישור לפריט קטלוג';

alter table public.sales_orders enable row level security;
alter table public.sales_order_lines enable row level security;

grant select, insert, update, delete on public.sales_orders to authenticated;
grant select, insert, update, delete on public.sales_order_lines to authenticated;
grant all on public.sales_orders to service_role;
grant all on public.sales_order_lines to service_role;

drop policy if exists sales_orders_all_authenticated on public.sales_orders;
create policy sales_orders_all_authenticated
  on public.sales_orders
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists sales_order_lines_all_authenticated on public.sales_order_lines;
create policy sales_order_lines_all_authenticated
  on public.sales_order_lines
  for all
  to authenticated
  using (true)
  with check (true);
