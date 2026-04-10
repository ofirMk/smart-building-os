-- AI-suggested GL account code: bridge Projects ↔ Finance (chart of accounts)

alter table public.contracts
  add column if not exists gl_account_code text null;

comment on column public.contracts.gl_account_code is
  'קוד חשבון מהמפה (account_code) — סיווג AI לחיבור הנה״ח';

alter table public.project_progress_reports
  add column if not exists gl_account_code text null;

comment on column public.project_progress_reports.gl_account_code is
  'צילום קוד חשבון בשעת שמירת דוח/בסיס (מסמך חשבון חלקי)';
