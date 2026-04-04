-- Idempotent: environments that skipped earlier migrations still get partner profitability columns.
alter table public.projects
  add column if not exists partner_cost_subcontractors numeric(18, 2) not null default 0,
  add column if not exists partner_cost_employee_salaries numeric(18, 2) not null default 0,
  add column if not exists partner_cost_petty_cash numeric(18, 2) not null default 0,
  add column if not exists partner_cost_site_overhead numeric(18, 2) not null default 0;
