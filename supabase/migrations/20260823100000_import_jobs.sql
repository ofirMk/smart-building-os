-- ============================================================================
-- Sprint 1 / Step 1 — Generic Import Jobs registry
-- ----------------------------------------------------------------------------
-- מטרה: רישום ותיעוד של כל ניסיון ייבוא (CSV/XLSX) ל-master data של
--   המערכת. כל job חי כשורה אחת ומשמרת את המקור (file_name + checksum),
--   הסטטוס (uploaded → previewed → committed | failed), ספירות (rows
--   total/success/error), ואת ה-error report המלא בתור JSON.
--
-- שימוש:
--   • ה-UI ב-`app/(dashboard)/admin/import/` יוצר רשומה ב-uploaded,
--     ועובר ל-previewed אחרי dry-run, ול-committed אחרי commit מוצלח.
--   • דוח רקונסיליציה (Step 19 ב-lihtman-onboarding-playbook.md) נשען
--     על ה-table הזה — `select * from erp_import_jobs where status='committed'`.
--
-- אבטחה:
--   • RLS: רק חברי החברה הפעילה יכולים לראות / לכתוב jobs של החברה.
--   • Admins (membership.role='admin') בלבד יכולים ליצור / לבצע commit
--     — נאכף ב-server action, לא ב-RLS (RLS לא רואה role).
-- ============================================================================

set search_path = public;

create table if not exists public.erp_import_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete cascade,
  entity_kind text not null,
  status text not null default 'uploaded'
    constraint erp_import_jobs_status_chk
    check (status in ('uploaded', 'previewed', 'committed', 'failed', 'cancelled')),
  -- Source artifact
  file_name text not null,
  file_size_bytes bigint not null default 0,
  file_checksum_sha256 text null,
  -- Counts populated at dry-run time, finalized at commit time
  rows_total integer not null default 0,
  rows_success integer not null default 0,
  rows_error integer not null default 0,
  rows_skipped integer not null default 0,
  -- Per-row errors: array of { row_number, field, message, raw_value }
  error_report jsonb not null default '[]'::jsonb,
  -- Free-form summary for the UI (warnings, mapping notes)
  summary_text text null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  previewed_at timestamptz null,
  committed_at timestamptz null,
  failed_at timestamptz null,
  constraint erp_import_jobs_entity_kind_nonempty check (length(trim(entity_kind)) > 0),
  constraint erp_import_jobs_file_name_nonempty check (length(trim(file_name)) > 0),
  constraint erp_import_jobs_error_report_array_chk check (jsonb_typeof(error_report) = 'array'),
  constraint erp_import_jobs_counts_nonneg check (
    rows_total >= 0 and rows_success >= 0 and rows_error >= 0 and rows_skipped >= 0
  )
);

create index if not exists erp_import_jobs_company_created_at_idx
  on public.erp_import_jobs (company_id, created_at desc);
create index if not exists erp_import_jobs_company_entity_idx
  on public.erp_import_jobs (company_id, entity_kind);
create index if not exists erp_import_jobs_company_status_idx
  on public.erp_import_jobs (company_id, status);
create index if not exists erp_import_jobs_created_by_idx
  on public.erp_import_jobs (created_by);

alter table public.erp_import_jobs enable row level security;

drop policy if exists erp_import_jobs_select on public.erp_import_jobs;
create policy erp_import_jobs_select
  on public.erp_import_jobs
  for select
  to authenticated
  using (public.user_has_company_access(company_id));

drop policy if exists erp_import_jobs_write on public.erp_import_jobs;
create policy erp_import_jobs_write
  on public.erp_import_jobs
  for all
  to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_import_jobs_service_role on public.erp_import_jobs;
create policy erp_import_jobs_service_role
  on public.erp_import_jobs
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update, delete on public.erp_import_jobs to authenticated;
grant all on public.erp_import_jobs to service_role;

comment on table public.erp_import_jobs is
  'Audit + tracking for CSV/XLSX master-data imports. Source of truth for the reconciliation report.';
comment on column public.erp_import_jobs.entity_kind is
  'Importer key from registry (e.g. ''suppliers'', ''items'', ''accounts'').';
