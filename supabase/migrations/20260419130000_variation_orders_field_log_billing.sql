-- Variation orders (חריגים) vs base contract; daily log approval for field→billing.

-- ---------------------------------------------------------------------------
-- project_daily_logs: mark logs approved for billing / quantity proposals
-- ---------------------------------------------------------------------------
alter table public.project_daily_logs
  add column if not exists field_approval_status text not null default 'draft';

alter table public.project_daily_logs
  drop constraint if exists project_daily_logs_field_approval_status_chk;

alter table public.project_daily_logs
  add constraint project_daily_logs_field_approval_status_chk
  check (field_approval_status in ('draft', 'approved'));

comment on column public.project_daily_logs.field_approval_status is
  'יומן בשטח: draft עד אישור; approved — נכלל בהצעות חיוב משדה';

create index if not exists project_daily_logs_project_approved_idx
  on public.project_daily_logs (project_id, log_date desc)
  where field_approval_status = 'approved';

-- ---------------------------------------------------------------------------
-- contract_variation_orders + lines (extras outside base BoQ)
-- ---------------------------------------------------------------------------
create table if not exists public.contract_variation_orders (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  vo_number integer not null,
  title text not null default '',
  status text not null default 'draft'
    constraint contract_variation_orders_status_chk
    check (status in ('draft', 'submitted', 'approved', 'rejected')),
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_variation_orders_vo_number_pos check (vo_number > 0),
  constraint contract_variation_orders_contract_vo_uq unique (contract_id, vo_number)
);

create index if not exists contract_variation_orders_contract_idx
  on public.contract_variation_orders (contract_id, status);

comment on table public.contract_variation_orders is
  'הזמנות שינוי (VO) — בסיס מול חריגים מאושרים';

create table if not exists public.contract_variation_lines (
  id uuid primary key default gen_random_uuid(),
  variation_order_id uuid not null references public.contract_variation_orders (id) on delete cascade,
  line_index integer not null default 0,
  section_code text,
  description text not null,
  unit text,
  quantity numeric(18, 4) not null default 0
    constraint contract_variation_lines_qty_nonneg check (quantity >= 0),
  unit_price numeric(18, 2) not null default 0
    constraint contract_variation_lines_price_nonneg check (unit_price >= 0),
  line_total numeric(18, 2) not null default 0
    constraint contract_variation_lines_total_nonneg check (line_total >= 0),
  created_at timestamptz not null default now(),
  constraint contract_variation_lines_line_index_nonneg check (line_index >= 0)
);

create index if not exists contract_variation_lines_vo_idx
  on public.contract_variation_lines (variation_order_id, line_index);

comment on table public.contract_variation_lines is
  'שורות VO — כמויות ומחירים נעולים לאחר אישור';

drop trigger if exists contract_variation_orders_updated_at on public.contract_variation_orders;
create trigger contract_variation_orders_updated_at
  before update on public.contract_variation_orders
  for each row
  execute function public.set_updated_at();

alter table public.contract_variation_orders enable row level security;
alter table public.contract_variation_lines enable row level security;

drop policy if exists contract_variation_orders_authenticated_all on public.contract_variation_orders;
create policy contract_variation_orders_authenticated_all
  on public.contract_variation_orders for all
  to authenticated
  using (true) with check (true);

drop policy if exists contract_variation_lines_authenticated_all on public.contract_variation_lines;
create policy contract_variation_lines_authenticated_all
  on public.contract_variation_lines for all
  to authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.contract_variation_orders to authenticated;
grant select, insert, update, delete on public.contract_variation_lines to authenticated;
grant all on public.contract_variation_orders to service_role;
grant all on public.contract_variation_lines to service_role;
