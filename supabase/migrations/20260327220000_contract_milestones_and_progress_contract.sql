-- אבני דרך לחוזה + דיווח התקדמות מקושר ל-contract (לא ל-tender/BoQ)
create table if not exists public.contract_milestones (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  title text not null,
  amount numeric(18, 2) not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint contract_milestones_amount_nonneg check (amount >= 0)
);

create index if not exists contract_milestones_contract_id_idx
  on public.contract_milestones (contract_id);

comment on table public.contract_milestones is 'אבני דרך לחישוב חשבונות חלקיים מול חוזה';

alter table public.contract_milestones enable row level security;

drop policy if exists contract_milestones_admin_all on public.contract_milestones;

create policy contract_milestones_admin_all
  on public.contract_milestones
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

grant select, insert, update, delete on public.contract_milestones to authenticated;
grant all on public.contract_milestones to service_role;

-- מעבר project_progress_* מ-tender/BoQ ל-contract / אבני דרך (מנקה נתונים קיימים)
truncate table public.project_progress_reports cascade;

drop index if exists public.project_progress_reports_tender_month_uq;

alter table public.project_progress_reports drop constraint if exists project_progress_reports_tender_id_fkey;

alter table public.project_progress_reports drop column if exists tender_id;

alter table public.project_progress_reports
  add column contract_id uuid not null references public.contracts (id) on delete restrict;

create unique index if not exists project_progress_reports_contract_month_uq
  on public.project_progress_reports (contract_id, report_month);

alter table public.project_progress_items drop constraint if exists project_progress_items_tender_boq_item_id_fkey;

alter table public.project_progress_items drop column if exists tender_boq_item_id;

alter table public.project_progress_items
  add column contract_milestone_id uuid not null references public.contract_milestones (id) on delete restrict;

create index if not exists project_progress_items_milestone_id_idx
  on public.project_progress_items (contract_milestone_id);

alter table public.project_progress_items drop constraint if exists project_progress_items_prices_nonneg;

alter table public.project_progress_items
  add constraint project_progress_items_unit_price_nonneg check (unit_price >= 0);

comment on column public.project_progress_reports.cumulative_works_total is
  'במודל אבני דרך: סכום אושר בחשבון זה (לפני מדד) — סכום עמודת אושר בשורות';
comment on column public.project_progress_items.unit_price is 'סכום אבן הדרך (100%) — צילום לשמירה';
comment on column public.project_progress_items.quantity_previous_cumulative is 'אחוז ביצוע מצטבר קודם (0–100)';
comment on column public.project_progress_items.quantity_current_cumulative is 'אחוז ביצוע מצטבר נוכחי (0–100)';
comment on column public.project_progress_items.line_total is 'אושר בחשבון זה (₪): (נוכחי−קודם)/100×סכום אבן דרך';
