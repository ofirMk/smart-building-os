-- Global billing defaults + audit when a field daily log is approved for partial-account sync.

alter table public.company_profile
  add column if not exists default_vat_rate_percent numeric(5, 2) not null default 18.00;

alter table public.company_profile
  drop constraint if exists company_profile_default_vat_chk;

alter table public.company_profile
  add constraint company_profile_default_vat_chk
  check (default_vat_rate_percent >= 0 and default_vat_rate_percent <= 100);

alter table public.company_profile
  add column if not exists default_retention_percent numeric(5, 2) not null default 5.00;

alter table public.company_profile
  drop constraint if exists company_profile_default_retention_chk;

alter table public.company_profile
  add constraint company_profile_default_retention_chk
  check (default_retention_percent >= 0 and default_retention_percent <= 100);

alter table public.company_profile
  add column if not exists indexation_source_note text null;

comment on column public.company_profile.default_vat_rate_percent is
  'Default VAT % for UI and new documents; contract lines may override.';

comment on column public.company_profile.default_retention_percent is
  'Suggested retainage % when opening contracts without explicit rules.';

comment on column public.company_profile.indexation_source_note is
  'Display label for index source (e.g. CBS); CPI rows use ref_index_history.';

alter table public.project_daily_logs
  add column if not exists field_approved_at timestamptz null;

alter table public.project_daily_logs
  add column if not exists field_approved_by uuid null references auth.users (id) on delete set null;

comment on column public.project_daily_logs.field_approved_at is
  'Timestamp when field_approval_status became approved (billing eligibility).';

comment on column public.project_daily_logs.field_approved_by is
  'Auth user who approved the log for billing / partial sync.';
