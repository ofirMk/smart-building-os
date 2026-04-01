-- מודול 3.2 — דיווח התקדמות / חשבונות חלקיים
create table if not exists public.project_progress_reports (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references public.tenders (id) on delete restrict,
  report_month text not null,
  created_at timestamptz not null default now(),
  constraint project_progress_reports_month_fmt check (
    report_month ~ '^\d{4}-(0[1-9]|1[0-2])$'
  )
);

create unique index if not exists project_progress_reports_tender_month_uq
  on public.project_progress_reports (tender_id, report_month);

create table if not exists public.project_progress_items (
  id uuid primary key default gen_random_uuid(),
  progress_report_id uuid not null references public.project_progress_reports (id) on delete cascade,
  tender_boq_item_id uuid not null references public.tender_boq_items (id) on delete restrict,
  quantity_executed numeric(18, 4) not null,
  unit_price numeric(18, 2) not null,
  line_total numeric(18, 2) not null,
  created_at timestamptz not null default now(),
  constraint project_progress_items_qty_nonneg check (quantity_executed >= 0),
  constraint project_progress_items_prices_nonneg check (unit_price >= 0 and line_total >= 0)
);

create index if not exists project_progress_items_report_id_idx
  on public.project_progress_items (progress_report_id);

alter table public.project_progress_reports enable row level security;
alter table public.project_progress_items enable row level security;

drop policy if exists project_progress_reports_admin_all on public.project_progress_reports;
drop policy if exists project_progress_items_admin_all on public.project_progress_items;

create policy project_progress_reports_admin_all
  on public.project_progress_reports
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

create policy project_progress_items_admin_all
  on public.project_progress_items
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'::public.user_role
    )
  );

grant select, insert, update, delete on public.project_progress_reports to authenticated;
grant select, insert, update, delete on public.project_progress_items to authenticated;
grant all on public.project_progress_reports to service_role;
grant all on public.project_progress_items to service_role;
