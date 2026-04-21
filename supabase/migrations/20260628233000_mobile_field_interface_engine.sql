-- Mobile-first field operations backbone:
-- work logs, material receipts, and inventory movement journal.

create table if not exists public.erp_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  project_id uuid not null references public.erp_proj_projects (id) on delete restrict,
  movement_type text not null,
  source_type text not null,
  source_id uuid not null,
  source_line_id uuid null,
  item_sku varchar(64) null,
  quantity numeric(18,3) not null default 0,
  unit_cost numeric(18,4) not null default 0,
  total_value numeric(18,2) not null default 0,
  note text null,
  moved_by_user_id uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint erp_inventory_movements_type_chk
    check (movement_type in ('IN', 'OUT', 'ADJUSTMENT')),
  constraint erp_inventory_movements_qty_nonnegative check (quantity >= 0),
  constraint erp_inventory_movements_cost_nonnegative check (unit_cost >= 0)
);

create index if not exists erp_inventory_movements_company_project_idx
  on public.erp_inventory_movements (company_id, project_id, created_at desc);

create or replace function public.erp_inventory_movements_total_value_trg()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.total_value := round(coalesce(new.quantity, 0) * coalesce(new.unit_cost, 0), 2);
  return new;
end;
$$;

drop trigger if exists erp_inventory_movements_total_value_trg on public.erp_inventory_movements;
create trigger erp_inventory_movements_total_value_trg
before insert or update of quantity, unit_cost on public.erp_inventory_movements
for each row execute function public.erp_inventory_movements_total_value_trg();

create table if not exists public.erp_field_work_logs (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  project_id uuid not null references public.erp_proj_projects (id) on delete restrict,
  work_date date not null default (timezone('utc', now()))::date,
  wbs_chapter text not null,
  workers_count integer not null default 0,
  machinery_hours numeric(18,2) not null default 0,
  progress_pct numeric(8,2) not null default 0,
  note text null,
  reported_by_user_id uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint erp_field_work_logs_wbs_nonempty check (length(trim(wbs_chapter)) > 0),
  constraint erp_field_work_logs_workers_nonnegative check (workers_count >= 0),
  constraint erp_field_work_logs_hours_nonnegative check (machinery_hours >= 0),
  constraint erp_field_work_logs_progress_range check (progress_pct >= 0 and progress_pct <= 100)
);

create index if not exists erp_field_work_logs_company_project_idx
  on public.erp_field_work_logs (company_id, project_id, work_date desc);

create table if not exists public.erp_field_material_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  project_id uuid not null references public.erp_proj_projects (id) on delete restrict,
  purchase_order_id uuid not null references public.erp_purchase_orders (id) on delete restrict,
  purchase_order_line_id uuid null references public.erp_purchase_order_lines (id) on delete set null,
  received_qty numeric(18,3) not null default 0,
  receipt_note text null,
  received_by_user_id uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint erp_field_material_receipts_qty_nonnegative check (received_qty >= 0)
);

create index if not exists erp_field_material_receipts_company_project_idx
  on public.erp_field_material_receipts (company_id, project_id, created_at desc);

alter table public.erp_inventory_movements enable row level security;
alter table public.erp_field_work_logs enable row level security;
alter table public.erp_field_material_receipts enable row level security;

drop policy if exists erp_inventory_movements_all_authenticated on public.erp_inventory_movements;
create policy erp_inventory_movements_all_authenticated on public.erp_inventory_movements
  for all to authenticated using (true) with check (true);

drop policy if exists erp_field_work_logs_all_authenticated on public.erp_field_work_logs;
create policy erp_field_work_logs_all_authenticated on public.erp_field_work_logs
  for all to authenticated using (true) with check (true);

drop policy if exists erp_field_material_receipts_all_authenticated on public.erp_field_material_receipts;
create policy erp_field_material_receipts_all_authenticated on public.erp_field_material_receipts
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.erp_inventory_movements to authenticated;
grant select, insert, update, delete on public.erp_field_work_logs to authenticated;
grant select, insert, update, delete on public.erp_field_material_receipts to authenticated;
