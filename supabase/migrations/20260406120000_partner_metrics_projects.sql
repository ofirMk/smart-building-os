-- Partner profitability dashboard: assign managing partner + manual cost buckets (until full ERP allocation).
-- Profit formula (app): client_invoices - (subcon + salaries + petty + overhead + procurement_po).

alter table public.projects
  add column if not exists managing_partner_id uuid references auth.users (id) on delete set null;

create index if not exists projects_managing_partner_id_idx
  on public.projects (managing_partner_id)
  where managing_partner_id is not null;

alter table public.projects
  add column if not exists partner_cost_subcontractors numeric(18, 2) not null default 0,
  add column if not exists partner_cost_employee_salaries numeric(18, 2) not null default 0,
  add column if not exists partner_cost_petty_cash numeric(18, 2) not null default 0,
  add column if not exists partner_cost_site_overhead numeric(18, 2) not null default 0;

comment on column public.projects.managing_partner_id is 'שותף מנהל פרויקט (לדשבורד רווחיות שותפים)';
comment on column public.projects.partner_cost_subcontractors is 'עלות קבלני משנה (ידני / ממשק עתידי)';
comment on column public.projects.partner_cost_employee_salaries is 'שכר עובדים משוקלל לפרויקט';
comment on column public.projects.partner_cost_petty_cash is 'קופה קטנה / הוצאות שוטפות';
comment on column public.projects.partner_cost_site_overhead is 'עלות אחזקת שטח / אתר';
