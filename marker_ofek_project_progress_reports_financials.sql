-- זהה ל־supabase/migrations/20260327210000_project_progress_reports_financials.sql

alter table public.project_progress_reports
  add column if not exists indexation_amount numeric(18, 2) not null default 0,
  add column if not exists retention_percent numeric(8, 4) not null default 0,
  add column if not exists retention_amount numeric(18, 2) not null default 0,
  add column if not exists deductions_amount numeric(18, 2) not null default 0,
  add column if not exists previous_billed_amount numeric(18, 2) not null default 0,
  add column if not exists cumulative_works_total numeric(18, 2) not null default 0,
  add column if not exists total_payable numeric(18, 2) not null default 0;

alter table public.project_progress_items
  add column if not exists quantity_contract numeric(18, 4),
  add column if not exists quantity_previous_cumulative numeric(18, 4) not null default 0,
  add column if not exists quantity_current_cumulative numeric(18, 4) not null default 0,
  add column if not exists quantity_executed_month numeric(18, 4) not null default 0,
  add column if not exists line_cumulative_value numeric(18, 2) not null default 0;

-- mirror: supabase/migrations/20260327250000_progress_report_submitted_report_date.sql
alter table public.project_progress_reports
  add column if not exists report_date date;

alter table public.project_progress_reports
  drop constraint if exists project_progress_reports_status_chk;

alter table public.project_progress_reports
  add constraint project_progress_reports_status_chk
  check (status in ('draft', 'approved', 'submitted', 'void'));
