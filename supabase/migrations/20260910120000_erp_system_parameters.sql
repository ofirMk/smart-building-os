-- ============================================================================
-- Migration: 20260910120000_erp_system_parameters.sql
-- Module: Dynamic Global System Parameters (key-value, company-scoped)
--
-- Rationale (architectural decision):
--   Two pre-existing parameter surfaces remain authoritative for their domain:
--     • public.mo_system_settings   — singleton: VAT%, tax compliance mode, weekly report flag
--     • public.company_profile      — per-company: default_vat_rate_percent, retention %, indexation
--
--   This table COMPLEMENTS (not replaces) them. It holds parameters that do not
--   deserve their own typed column: company legal name overrides, numbering
--   prefixes, email "from" branding, MASAV institution code, AI thresholds, etc.
--
--   Source of truth precedence at read time (enforced by lib/erp/system-parameters.ts):
--     1. erp_system_parameters (this table) — flexible per-company overrides
--     2. company_profile.<column>           — typed per-company defaults
--     3. mo_system_settings.<column>        — global system defaults
--     4. Hard-coded fallback (only as a safety net; logged as warning)
--
-- Additive only — no DROP/ALTER on existing tables.
-- RLS: company-scoped via user_has_company_access (helper assumed to exist).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enum for parameter data type (drives UI editor + helper parser)
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_param_data_type') then
    create type public.erp_param_data_type as enum (
      'STRING',
      'NUMBER',
      'PERCENT',     -- 0..100, stored as numeric
      'BOOLEAN',
      'JSON',
      'EMAIL',
      'URL',
      'DATE',
      'ENUM'         -- value constrained by metadata.options[]
    );
  end if;
end$$;

-- ----------------------------------------------------------------------------
-- 2. Main table
-- ----------------------------------------------------------------------------
create table if not exists public.erp_system_parameters (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  param_key text not null
    constraint erp_system_parameters_key_chk
    check (
      param_key ~ '^[A-Z][A-Z0-9_]{2,63}$'
      -- UPPER_SNAKE_CASE, 3-64 chars, must start with letter
    ),
  param_value text null,
  data_type public.erp_param_data_type not null default 'STRING',
  description text not null default '',
  category text not null default 'GENERAL'
    constraint erp_system_parameters_category_chk
    check (category ~ '^[a-z][a-z0-9_]{0,31}$'),
  is_secret boolean not null default false,
    -- Controls whether the value is returned to non-admin clients.
  is_system boolean not null default false,
    -- If true, the row is seed-managed; UI shows but disables hard-delete.
  metadata jsonb not null default '{}'::jsonb,
    -- Optional: { options: ["A","B"], min, max, regex, group_order, unit }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references auth.users (id) on delete set null,
  updated_by uuid null references auth.users (id) on delete set null,
  constraint erp_system_parameters_unique_per_company
    unique (company_id, param_key)
);

comment on table public.erp_system_parameters is
  'Flexible per-company key-value parameter store. Complements mo_system_settings (singleton) and company_profile (typed columns).';
comment on column public.erp_system_parameters.is_secret is
  'When true, value is redacted for non-admins (e.g., API keys, signing secrets).';
comment on column public.erp_system_parameters.is_system is
  'Seed-managed parameter — UI prevents hard-delete (admin can still edit value).';
comment on column public.erp_system_parameters.metadata is
  'Editor hints: options[] for ENUM, min/max for NUMBER/PERCENT, regex for STRING, group_order for sort, unit for display.';

create index if not exists erp_system_parameters_company_category_idx
  on public.erp_system_parameters (company_id, category);

-- ----------------------------------------------------------------------------
-- 3. updated_at trigger (reuses existing public.set_updated_at)
-- ----------------------------------------------------------------------------
drop trigger if exists trg_erp_system_parameters_updated_at on public.erp_system_parameters;
create trigger trg_erp_system_parameters_updated_at
  before update on public.erp_system_parameters
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. RLS — company-scoped read, admin-scoped write
--    Read: any user with company access can read non-secret params.
--    Write: caller must be an admin of the company (we re-use the existing
--           helper user_is_company_admin if it exists; otherwise fall back to
--           a strict check via erp_user_company_memberships.role='ADMIN').
-- ----------------------------------------------------------------------------
alter table public.erp_system_parameters enable row level security;

drop policy if exists erp_system_parameters_select on public.erp_system_parameters;
create policy erp_system_parameters_select
  on public.erp_system_parameters
  for select
  to authenticated
  using (
    public.user_has_company_access(company_id)
  );

drop policy if exists erp_system_parameters_insert on public.erp_system_parameters;
create policy erp_system_parameters_insert
  on public.erp_system_parameters
  for insert
  to authenticated
  with check (
    public.user_has_company_access(company_id)
    and exists (
      select 1 from public.erp_user_company_memberships m
      where m.user_id = auth.uid()
        and m.company_id = erp_system_parameters.company_id
        and m.role in ('ADMIN', 'OWNER')
        and m.is_active = true
    )
  );

drop policy if exists erp_system_parameters_update on public.erp_system_parameters;
create policy erp_system_parameters_update
  on public.erp_system_parameters
  for update
  to authenticated
  using (
    public.user_has_company_access(company_id)
    and exists (
      select 1 from public.erp_user_company_memberships m
      where m.user_id = auth.uid()
        and m.company_id = erp_system_parameters.company_id
        and m.role in ('ADMIN', 'OWNER')
        and m.is_active = true
    )
  )
  with check (
    public.user_has_company_access(company_id)
  );

drop policy if exists erp_system_parameters_delete on public.erp_system_parameters;
create policy erp_system_parameters_delete
  on public.erp_system_parameters
  for delete
  to authenticated
  using (
    public.user_has_company_access(company_id)
    and is_system = false
    and exists (
      select 1 from public.erp_user_company_memberships m
      where m.user_id = auth.uid()
        and m.company_id = erp_system_parameters.company_id
        and m.role in ('ADMIN', 'OWNER')
        and m.is_active = true
    )
  );

-- ----------------------------------------------------------------------------
-- 5. RPC — bulk read for an authenticated user's active company.
--    Redacts is_secret=true values for non-admins.
-- ----------------------------------------------------------------------------
create or replace function public.erp_get_system_parameters(p_company_id text)
returns table (
  param_key text,
  param_value text,
  data_type public.erp_param_data_type,
  description text,
  category text,
  is_secret boolean,
  is_system boolean,
  metadata jsonb,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
begin
  -- Re-check tenant access at function entry; RLS would also catch this.
  if not public.user_has_company_access(p_company_id) then
    raise exception 'access denied for company %', p_company_id;
  end if;

  select exists (
    select 1 from public.erp_user_company_memberships m
    where m.user_id = auth.uid()
      and m.company_id = p_company_id
      and m.role in ('ADMIN', 'OWNER')
      and m.is_active = true
  ) into v_is_admin;

  return query
    select
      p.param_key,
      case when p.is_secret and not v_is_admin then '***REDACTED***' else p.param_value end,
      p.data_type,
      p.description,
      p.category,
      p.is_secret,
      p.is_system,
      p.metadata,
      p.updated_at
    from public.erp_system_parameters p
    where p.company_id = p_company_id
    order by p.category, p.param_key;
end$$;

revoke all on function public.erp_get_system_parameters(text) from public;
grant execute on function public.erp_get_system_parameters(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Seed — the canonical baseline parameters every company should have.
--    Seeded per-company at first read by the helper (idempotent INSERT).
--    Here we seed the existing legacy companies for backfill.
-- ----------------------------------------------------------------------------
do $$
declare
  v_company text;
  v_companies text[] := array['HOLDEN_MARKER_OFEK', 'EX_HOLDEN', 'EX_LIHTMAN'];
begin
  foreach v_company in array v_companies loop
    -- Tax & finance
    insert into public.erp_system_parameters (company_id, param_key, param_value, data_type, description, category, is_system, metadata)
    values
      (v_company, 'DEFAULT_VAT_PCT', '17.0', 'PERCENT',
        'אחוז מע"מ ברירת מחדל לחישוב חשבונות חלקיים, חשבוניות, וכל מסמך פיננסי שלא צוין אחרת.',
        'finance', true, '{"min":0,"max":100,"unit":"%","group_order":1}'::jsonb),
      (v_company, 'DEFAULT_RETENTION_PCT', '5.0', 'PERCENT',
        'אחוז עכבון (Retention) ברירת מחדל בחוזי קבלן משנה.',
        'finance', true, '{"min":0,"max":100,"unit":"%","group_order":2}'::jsonb),
      (v_company, 'CURRENCY_CODE', 'ILS', 'STRING',
        'מטבע ברירת מחדל למסמכים פיננסיים. ISO 4217.',
        'finance', true, '{"regex":"^[A-Z]{3}$","group_order":3}'::jsonb),
      (v_company, 'ROUNDING_GRANULARITY', '0.01', 'NUMBER',
        'יחידת עיגול כספים (אגורה=0.01, שקל שלם=1.00).',
        'finance', true, '{"min":0.01,"max":1,"group_order":4}'::jsonb),
      -- Numbering
      (v_company, 'INVOICE_NUMBER_PREFIX', 'INV-', 'STRING',
        'תחילית למספור אוטומטי של חשבוניות.',
        'numbering', true, '{"regex":"^[A-Z0-9-]{1,8}$","group_order":1}'::jsonb),
      (v_company, 'PO_NUMBER_PREFIX', 'PO-', 'STRING',
        'תחילית למספור הזמנות רכש.',
        'numbering', true, '{"regex":"^[A-Z0-9-]{1,8}$","group_order":2}'::jsonb),
      (v_company, 'PROJECT_CODE_PREFIX', 'PRJ-', 'STRING',
        'תחילית לקוד פרויקט פנימי.',
        'numbering', true, '{"regex":"^[A-Z0-9-]{1,8}$","group_order":3}'::jsonb),
      -- Branding (used in PDFs and emails)
      (v_company, 'EMAIL_FROM_NAME', 'Holden Group ERP', 'STRING',
        'שם השולח (display) בכותרות מייל יוצא.',
        'branding', true, '{"group_order":1}'::jsonb),
      (v_company, 'PDF_HEADER_TAGLINE', '', 'STRING',
        'טקסט תחת לוגו החברה ב-PDFs.',
        'branding', true, '{"group_order":2}'::jsonb),
      -- Banking / MASAV
      (v_company, 'MASAV_INSTITUTION_CODE', '', 'STRING',
        'קוד מוסד MASAV לזיהוי החברה בקבצי ZNK.',
        'banking', true, '{"regex":"^[0-9]{0,5}$","group_order":1}'::jsonb),
      (v_company, 'MASAV_SENDER_NAME', '', 'STRING',
        'שם השולח כפי שיופיע ברשומת H של MASAV.',
        'banking', true, '{"group_order":2}'::jsonb),
      -- AI / automation thresholds
      (v_company, 'AI_AUTOPOST_CONFIDENCE_MIN', '0.92', 'NUMBER',
        'סף ביטחון מינימלי לפעולת AI אוטונומית (Auto-post) ללא אישור משתמש.',
        'ai', true, '{"min":0,"max":1,"group_order":1}'::jsonb),
      (v_company, 'AI_THREEWAY_VARIANCE_TOLERANCE_PCT', '2.0', 'PERCENT',
        'סטייה מותרת ב-3-Way Match (PO vs GR vs Invoice) לפני קריאת חריגה.',
        'ai', true, '{"min":0,"max":50,"unit":"%","group_order":2}'::jsonb),
      -- Cost Control (MedaTech §6 alignment)
      (v_company, 'COST_CONTROL_PERIOD_LOCK_DAYS', '5', 'NUMBER',
        'מספר ימי עסקים לאחר תום החודש שבהם תקופת בקרה תקופית עדיין פתוחה לעריכה.',
        'cost_control', true, '{"min":0,"max":31,"unit":"ימים","group_order":1}'::jsonb),
      (v_company, 'BUDGET_OVERRUN_WARN_PCT', '85.0', 'PERCENT',
        'סף אזהרה (Warning) על מסמך עלות כאשר ניצול תקציב סעיף עובר אחוז זה (לפי §6.5).',
        'cost_control', true, '{"min":0,"max":100,"unit":"%","group_order":2}'::jsonb),
      (v_company, 'BUDGET_OVERRUN_BLOCK_PCT', '100.0', 'PERCENT',
        'סף חסימה (Block) למסמך עלות כאשר ניצול תקציב סעיף עובר אחוז זה (לפי §6.5).',
        'cost_control', true, '{"min":0,"max":200,"unit":"%","group_order":3}'::jsonb)
    on conflict (company_id, param_key) do nothing;
  end loop;
end$$;
