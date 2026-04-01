-- חשבון חלקי מצטבר: מדד, עכבון, קיזוזים, סה״כ לתשלום
alter table public.project_progress_reports
  add column if not exists indexation_amount numeric(18, 2) not null default 0,
  add column if not exists retention_percent numeric(8, 4) not null default 0,
  add column if not exists retention_amount numeric(18, 2) not null default 0,
  add column if not exists deductions_amount numeric(18, 2) not null default 0,
  add column if not exists previous_billed_amount numeric(18, 2) not null default 0,
  add column if not exists cumulative_works_total numeric(18, 2) not null default 0,
  add column if not exists total_payable numeric(18, 2) not null default 0;

comment on column public.project_progress_reports.indexation_amount is 'תוספת התייקרות / מדד';
comment on column public.project_progress_reports.retention_percent is 'אחוז עכבון';
comment on column public.project_progress_reports.retention_amount is 'סכום עכבון (מחושב לשמירה)';
comment on column public.project_progress_reports.deductions_amount is 'קיזוזים / הפחתות';
comment on column public.project_progress_reports.previous_billed_amount is 'סה״כ חויב בחשבונות קודמים (מצטבר)';
comment on column public.project_progress_reports.cumulative_works_total is 'סה״כ ערך עבודות בחוזה (מצטבר) לפני מדד';
comment on column public.project_progress_reports.total_payable is 'סה״כ לתשלום בחשבון זה';

alter table public.project_progress_items
  add column if not exists quantity_contract numeric(18, 4),
  add column if not exists quantity_previous_cumulative numeric(18, 4) not null default 0,
  add column if not exists quantity_current_cumulative numeric(18, 4) not null default 0,
  add column if not exists quantity_executed_month numeric(18, 4) not null default 0,
  add column if not exists line_cumulative_value numeric(18, 2) not null default 0;

comment on column public.project_progress_items.quantity_executed is 'כמות בוצעה בחודש (שמירה תואמת שדה legacy)';
comment on column public.project_progress_items.line_total is 'ערך שורה לחודש (בוצע החודש × מחיר יחידה)';
comment on column public.project_progress_items.line_cumulative_value is 'ערך מצטבר (כמות מצטברת נוכחית × מחיר יחידה)';
