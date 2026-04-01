-- דוחות חדשים: סטטוס submitted + תאריך דיווח
alter table public.project_progress_reports
  add column if not exists report_date date;

comment on column public.project_progress_reports.report_date is 'תאריך הדוח (יום הדיווח)';

alter table public.project_progress_reports
  drop constraint if exists project_progress_reports_status_chk;

alter table public.project_progress_reports
  add constraint project_progress_reports_status_chk
  check (status in ('draft', 'approved', 'submitted', 'void'));

comment on column public.project_progress_reports.status is
  'draft | submitted | approved | void';
