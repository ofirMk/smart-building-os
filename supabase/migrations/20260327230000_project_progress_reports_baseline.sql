-- Baseline / אישור דוח: סטטוס, מטא-נתונים מחשבון, מדדים
alter table public.project_progress_reports
  add column if not exists status text not null default 'approved',
  add column if not exists bill_number integer,
  add column if not exists bill_month_label text,
  add column if not exists base_index numeric(18, 4),
  add column if not exists current_index numeric(18, 4),
  add column if not exists insurance_amount numeric(18, 2) not null default 0,
  add column if not exists testing_amount numeric(18, 2) not null default 0;

alter table public.project_progress_reports
  drop constraint if exists project_progress_reports_status_chk;

alter table public.project_progress_reports
  add constraint project_progress_reports_status_chk
  check (status in ('draft', 'approved', 'void'));

comment on column public.project_progress_reports.status is
  'draft | approved | void — קו בסיס מ-AI נשמר כ-approved';
