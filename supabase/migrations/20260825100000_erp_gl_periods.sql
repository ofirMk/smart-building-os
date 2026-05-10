-- ============================================================================
-- Sprint A.1 / GL Foundation Closure — Period Management
-- ----------------------------------------------------------------------------
-- מטרה: השלמת ה-Financial Closure ע"י תקופות חשבונאיות (חודשי/רבעוני/שנתי).
--   • erp_gl_periods           — מעקב סטטוס תקופה (OPEN | CLOSED | LOCKED).
--   • טריגר על erp_gl_journal_entries: posting ל-period CLOSED/LOCKED נחסם.
--   • הגנת RLS לפי user_has_company_access (אותו דפוס כמו שאר ה-GL).
--
-- השפעה:
--   • ה-importer של opening_balances ממשיך לעבוד (entry_date נופל בתוך
--     period שצריך להיות OPEN; אחרת הוא נכשל בצורה ברורה).
--   • Sprint A.1 / Step 4 (Period Close UI) ישתמש ב-status = CLOSED.
-- ============================================================================

set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. erp_gl_periods
-- ----------------------------------------------------------------------------
create table if not exists public.erp_gl_periods (
  id              uuid primary key default gen_random_uuid(),
  company_id      text not null references public.erp_companies (id) on delete restrict,
  period_yyyymm   varchar(7) not null
    constraint erp_gl_periods_yyyymm_chk check (period_yyyymm ~ '^[0-9]{4}-[0-9]{2}$'),
  start_date      date not null,
  end_date        date not null,
  status          text not null default 'OPEN'
    constraint erp_gl_periods_status_chk check (status in ('OPEN', 'CLOSED', 'LOCKED')),
  closed_at       timestamptz null,
  closed_by       uuid null,
  locked_at       timestamptz null,
  locked_by       uuid null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint erp_gl_periods_dates_chk check (start_date <= end_date)
);

create unique index if not exists erp_gl_periods_company_yyyymm_uq
  on public.erp_gl_periods (company_id, period_yyyymm);
create index if not exists erp_gl_periods_company_dates_idx
  on public.erp_gl_periods (company_id, start_date, end_date);
create index if not exists erp_gl_periods_company_status_idx
  on public.erp_gl_periods (company_id, status);

drop trigger if exists erp_gl_periods_updated_at on public.erp_gl_periods;
create trigger erp_gl_periods_updated_at
  before update on public.erp_gl_periods
  for each row execute function public.set_updated_at();

comment on table public.erp_gl_periods is
  'תקופות חשבונאיות. status=OPEN→ניתן ל-post; CLOSED→חוסם posting (אפשר לבטל); LOCKED→חסום מוחלט.';

-- ----------------------------------------------------------------------------
-- 2. Trigger: block posting JE into a CLOSED/LOCKED period
-- ----------------------------------------------------------------------------
create or replace function public.erp_gl_assert_period_open()
returns trigger
language plpgsql
as $$
declare
  v_period_yyyymm  varchar(7);
  v_status         text;
begin
  -- only enforce when transitioning to POSTED status (drafts may live anywhere).
  if new.status <> 'POSTED' then
    return new;
  end if;
  if (tg_op = 'UPDATE' and old.status = 'POSTED') then
    -- already posted; lifecycle change handled separately.
    return new;
  end if;

  v_period_yyyymm := to_char(new.entry_date, 'YYYY-MM');

  select p.status
    into v_status
    from public.erp_gl_periods p
   where p.company_id = new.company_id
     and p.period_yyyymm = v_period_yyyymm;

  -- אם לא הוגדרה תקופה — מתירים. הגנה תופסת רק בחברות שכבר עברו לסגירה פורמלית.
  if v_status is null then
    return new;
  end if;

  if v_status in ('CLOSED', 'LOCKED') then
    raise exception
      'Cannot post journal entry % into period % — period is %',
      new.entry_number, v_period_yyyymm, v_status
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists erp_gl_journal_entries_period_chk on public.erp_gl_journal_entries;
create trigger erp_gl_journal_entries_period_chk
  before insert or update on public.erp_gl_journal_entries
  for each row execute function public.erp_gl_assert_period_open();

-- ----------------------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------------------
alter table public.erp_gl_periods enable row level security;

drop policy if exists erp_gl_periods_rw on public.erp_gl_periods;
create policy erp_gl_periods_rw
  on public.erp_gl_periods
  for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_gl_periods_service on public.erp_gl_periods;
create policy erp_gl_periods_service
  on public.erp_gl_periods for all to service_role
  using (true) with check (true);

grant select, insert, update, delete on public.erp_gl_periods to authenticated;
grant all on public.erp_gl_periods to service_role;

-- ----------------------------------------------------------------------------
-- 4. Seed: open periods for marker_ofek demo (current FY)
-- ----------------------------------------------------------------------------
do $$
declare
  v_company_id text := 'marker_ofek';
  v_year integer;
  v_month integer;
  v_yyyymm varchar(7);
  v_start date;
  v_end date;
begin
  if not exists (select 1 from public.erp_companies where id = v_company_id) then
    return;
  end if;

  -- Open all 12 months of 2026 + Jan-2027 buffer.
  for v_year in 2026..2027 loop
    for v_month in 1..12 loop
      if v_year = 2027 and v_month > 1 then exit; end if;
      v_yyyymm := to_char(make_date(v_year, v_month, 1), 'YYYY-MM');
      v_start := make_date(v_year, v_month, 1);
      v_end := (v_start + interval '1 month' - interval '1 day')::date;

      insert into public.erp_gl_periods (company_id, period_yyyymm, start_date, end_date, status)
      values (v_company_id, v_yyyymm, v_start, v_end, 'OPEN')
      on conflict (company_id, period_yyyymm) do nothing;
    end loop;
  end loop;
end
$$;
