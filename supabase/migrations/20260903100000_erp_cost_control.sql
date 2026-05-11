-- ============================================================================
-- Sprint A.5 — בקרה תקציבית (Cost Control) לפי MedaTech §6
-- Migration: 20260903100000_erp_cost_control.sql
--
-- מימוש מלא של "פרק 6 — בקרה תקציבית" מהמסמך המקורי (MedaTech 2016 ל"טמן):
--   §6.2.4  — ממדי בקרה חובה על כל שורת מסמך עלות (control_subchapter_id + control_resource_id)
--   §6.3.3  — פתיחת חשבון בקרה = מהדורת ביצוע חדשה (כבר מיושם ב-A.4)
--   §6.3.4  — תקופת בקרה (snapshot חודשי)           → erp_proj_control_periods
--             + snapshot rows per (subchapter, resource) → erp_proj_control_period_snapshots
--   §6.3.5  — RPC איסוף עלויות                      → erp_collect_costs(project_id, control_month)
--   §6.3.8/9 — צפי לגמר ידני                        → erp_proj_control_forecasts
--
-- Additive migration בלבד — אין DROP / ALTER על עמודות קיימות.
-- RLS: user_has_company_access על כל טבלה חדשה.
--
-- נקודת החלטה אדריכלית שחשוב לתעד:
--   שורות PO/GR/Invoice הקיימות כוללות עמודות טקסטואליות היסטוריות
--   (`budget_sub_chapter text` + `resource_id text`) שלא נוגעים בהן.
--   המיגרציה הזו מוסיפה **עמודות UUID חדשות** (`control_subchapter_id`,
--   `control_resource_id`) כ-FK אופציונליים (nullable) ל-
--   `erp_proj_control_subchapters` / `erp_proj_control_resources`.
--   ה-RPC `erp_collect_costs` משתמש בעמודות החדשות בלבד. עמודות הטקסט
--   נשמרות לצורך תאימות לאחור אך לא נקראות ע"י Cost Control.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. הוספת עמודות בקרה לטבלאות מסמכי עלות (additive, nullable)
-- ----------------------------------------------------------------------------
alter table public.erp_purchase_order_lines
  add column if not exists control_subchapter_id uuid null
    references public.erp_proj_control_subchapters (id) on delete set null,
  add column if not exists control_resource_id uuid null
    references public.erp_proj_control_resources (id) on delete set null;

create index if not exists erp_po_lines_control_sub_idx
  on public.erp_purchase_order_lines (company_id, control_subchapter_id)
  where control_subchapter_id is not null;
create index if not exists erp_po_lines_control_res_idx
  on public.erp_purchase_order_lines (company_id, control_resource_id)
  where control_resource_id is not null;

alter table public.erp_goods_receipt_lines
  add column if not exists control_subchapter_id uuid null
    references public.erp_proj_control_subchapters (id) on delete set null,
  add column if not exists control_resource_id uuid null
    references public.erp_proj_control_resources (id) on delete set null;

alter table public.erp_vendor_invoice_lines
  add column if not exists control_subchapter_id uuid null
    references public.erp_proj_control_subchapters (id) on delete set null,
  add column if not exists control_resource_id uuid null
    references public.erp_proj_control_resources (id) on delete set null;

create index if not exists erp_vi_lines_control_sub_idx
  on public.erp_vendor_invoice_lines (company_id, control_subchapter_id)
  where control_subchapter_id is not null;

-- Contract lines (subcontractor / supplier contracts) — erp_contract_lines
alter table public.erp_contract_lines
  add column if not exists control_subchapter_id uuid null
    references public.erp_proj_control_subchapters (id) on delete set null,
  add column if not exists control_resource_id uuid null
    references public.erp_proj_control_resources (id) on delete set null;

-- Subcontractor contract header — defaults that cascade into bill lines
alter table public.erp_subcontractor_contracts
  add column if not exists default_control_subchapter_id uuid null
    references public.erp_proj_control_subchapters (id) on delete set null,
  add column if not exists default_control_resource_id uuid null
    references public.erp_proj_control_resources (id) on delete set null;

create index if not exists erp_sc_contracts_default_sub_idx
  on public.erp_subcontractor_contracts (company_id, default_control_subchapter_id)
  where default_control_subchapter_id is not null;

-- Contract amendments — inherit from header by default but can override
alter table public.erp_contract_amendments
  add column if not exists control_subchapter_id uuid null
    references public.erp_proj_control_subchapters (id) on delete set null,
  add column if not exists control_resource_id uuid null
    references public.erp_proj_control_resources (id) on delete set null;

-- ----------------------------------------------------------------------------
-- 2. תקופות בקרה — erp_proj_control_periods
-- ----------------------------------------------------------------------------
-- Status enum for control periods
do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_proj_control_period_status') then
    create type public.erp_proj_control_period_status as enum (
      'OPEN',
      'COLLECTED',
      'CLOSED'
    );
  end if;
end
$$;

comment on type public.erp_proj_control_period_status is
  'מצב תקופת בקרה: OPEN=פתוחה לעדכון, COLLECTED=בוצע איסוף עלויות, CLOSED=סגורה לקריאה בלבד.';

create table if not exists public.erp_proj_control_periods (
  id                  uuid primary key default gen_random_uuid(),
  company_id          text not null references public.erp_companies (id) on delete restrict,
  project_id          uuid not null,
  control_month       text not null,             -- פורמט "MM/YY"  לפי MedaTech §6.3.4
  period_end_date     date not null,             -- היום האחרון של חודש הבקרה
  status              public.erp_proj_control_period_status not null default 'OPEN',
  is_today_snapshot   boolean not null default false,   -- תקופה מיוחדת "TODAY" (snapshot יומי)
  notes               text null,
  opened_at           timestamptz not null default now(),
  opened_by           uuid null,
  collected_at        timestamptz null,
  closed_at           timestamptz null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint erp_proj_control_periods_month_fmt_chk
    check (control_month ~ '^(0[1-9]|1[0-2])/[0-9]{2}$'),
  constraint erp_proj_control_periods_company_project_fk
    foreign key (company_id, project_id)
    references public.erp_proj_projects (company_id, id)
    on delete restrict,
  constraint erp_proj_control_periods_company_id_uq unique (company_id, id)
);

-- תקופה אחת בלבד לחודש פרויקט
create unique index if not exists erp_proj_control_periods_project_month_uq
  on public.erp_proj_control_periods (company_id, project_id, control_month);

-- תקופת TODAY אחת בלבד לפרויקט
create unique index if not exists erp_proj_control_periods_project_today_uq
  on public.erp_proj_control_periods (company_id, project_id)
  where is_today_snapshot = true;

create index if not exists erp_proj_control_periods_project_status_idx
  on public.erp_proj_control_periods (company_id, project_id, status);

drop trigger if exists erp_proj_control_periods_updated_at on public.erp_proj_control_periods;
create trigger erp_proj_control_periods_updated_at
  before update on public.erp_proj_control_periods
  for each row execute function public.set_updated_at();

comment on table public.erp_proj_control_periods is
  'תקופת בקרה חודשית לפרויקט — snapshot של המצב מתחילת הפרויקט עד period_end_date. MedaTech §6.3.4.';

-- RLS
alter table public.erp_proj_control_periods enable row level security;
drop policy if exists erp_proj_control_periods_select on public.erp_proj_control_periods;
create policy erp_proj_control_periods_select on public.erp_proj_control_periods
  for select using (public.user_has_company_access(company_id));
drop policy if exists erp_proj_control_periods_modify on public.erp_proj_control_periods;
create policy erp_proj_control_periods_modify on public.erp_proj_control_periods
  for all using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- ----------------------------------------------------------------------------
-- 3. Snapshots — erp_proj_control_period_snapshots
-- ----------------------------------------------------------------------------
-- כל שורה = חיתוך (subchapter, resource) בתוך תקופת בקרה אחת.
-- הערכים נכתבים ע"י RPC erp_collect_costs (לא ידנית).
create table if not exists public.erp_proj_control_period_snapshots (
  id                           uuid primary key default gen_random_uuid(),
  company_id                   text not null references public.erp_companies (id) on delete restrict,
  period_id                    uuid not null,
  project_id                   uuid not null,
  control_subchapter_id        uuid null,            -- null = כל תת-הפרקים (rollup)
  control_resource_id          uuid null,            -- null = כל המשאבים (rollup)
  -- תקציבים
  original_budget_amount       numeric(18,2) not null default 0,   -- מ-Zero Edition
  current_budget_amount        numeric(18,2) not null default 0,   -- מ-Execution Edition
  -- התחייבויות (Committed): PO lines + subcontractor contracts + amendments
  committed_po_amount          numeric(18,2) not null default 0,
  committed_contracts_amount   numeric(18,2) not null default 0,
  -- בפועל (Actual): vendor invoices approved + subcontractor bills approved
  actual_invoices_amount       numeric(18,2) not null default 0,
  actual_subbills_amount       numeric(18,2) not null default 0,
  -- מאושר לתשלום (§6.2.3)
  approved_in_books_amount     numeric(18,2) not null default 0,
  approved_off_books_amount    numeric(18,2) not null default 0,
  -- צפי לגמר (§6.3.9) — מגיע מ-erp_proj_control_forecasts אם קיים, אחרת 0
  forecast_to_complete_amount  numeric(18,2) not null default 0,
  -- חישובים (generated columns)
  total_committed_amount       numeric(18,2) generated always as (
    committed_po_amount + committed_contracts_amount
  ) stored,
  total_actual_amount          numeric(18,2) generated always as (
    actual_invoices_amount + actual_subbills_amount
  ) stored,
  eac_amount                   numeric(18,2) generated always as (
    -- EAC = Actual + max(Forecast, Committed − Actual)
    -- פשטנות: EAC = Actual + Forecast. אם Forecast=0, EAC = greatest(Committed, Actual)
    greatest(
      actual_invoices_amount + actual_subbills_amount + forecast_to_complete_amount,
      committed_po_amount + committed_contracts_amount
    )
  ) stored,
  variance_amount              numeric(18,2) generated always as (
    current_budget_amount - greatest(
      actual_invoices_amount + actual_subbills_amount + forecast_to_complete_amount,
      committed_po_amount + committed_contracts_amount
    )
  ) stored,
  collected_at                 timestamptz not null default now(),
  constraint erp_proj_ctrl_snap_company_period_fk
    foreign key (company_id, period_id)
    references public.erp_proj_control_periods (company_id, id)
    on delete cascade,
  constraint erp_proj_ctrl_snap_company_project_fk
    foreign key (company_id, project_id)
    references public.erp_proj_projects (company_id, id)
    on delete restrict,
  constraint erp_proj_ctrl_snap_subchapter_fk
    foreign key (control_subchapter_id)
    references public.erp_proj_control_subchapters (id)
    on delete set null,
  constraint erp_proj_ctrl_snap_resource_fk
    foreign key (control_resource_id)
    references public.erp_proj_control_resources (id)
    on delete set null
);

-- ייחודיות: צמד (subchapter, resource) בתוך תקופה = שורה אחת
-- null נטפל בעזרת coalesce לערך sentinel uuid אפס.
create unique index if not exists erp_proj_ctrl_snap_period_cuts_uq
  on public.erp_proj_control_period_snapshots (
    company_id,
    period_id,
    coalesce(control_subchapter_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(control_resource_id,  '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists erp_proj_ctrl_snap_project_idx
  on public.erp_proj_control_period_snapshots (company_id, project_id);
create index if not exists erp_proj_ctrl_snap_subchapter_idx
  on public.erp_proj_control_period_snapshots (company_id, control_subchapter_id)
  where control_subchapter_id is not null;

comment on table public.erp_proj_control_period_snapshots is
  'Snapshot של חיתוך (subchapter, resource) בתוך תקופת בקרה. נכתב ע"י RPC erp_collect_costs. MedaTech §6.2.3.';

alter table public.erp_proj_control_period_snapshots enable row level security;
drop policy if exists erp_proj_ctrl_snap_select on public.erp_proj_control_period_snapshots;
create policy erp_proj_ctrl_snap_select on public.erp_proj_control_period_snapshots
  for select using (public.user_has_company_access(company_id));
drop policy if exists erp_proj_ctrl_snap_modify on public.erp_proj_control_period_snapshots;
create policy erp_proj_ctrl_snap_modify on public.erp_proj_control_period_snapshots
  for all using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- ----------------------------------------------------------------------------
-- 4. Forecast-to-complete ידני — erp_proj_control_forecasts
-- ----------------------------------------------------------------------------
-- לכל (period, subchapter, resource) צפי לגמר ידני (§6.3.8/9).
create table if not exists public.erp_proj_control_forecasts (
  id                       uuid primary key default gen_random_uuid(),
  company_id               text not null references public.erp_companies (id) on delete restrict,
  period_id                uuid not null,
  project_id               uuid not null,
  control_subchapter_id    uuid not null,
  control_resource_id      uuid null,             -- null = ברמת תת-פרק כולו
  forecast_to_complete     numeric(18,2) not null default 0,
  forecast_revenue         numeric(18,2) not null default 0,
  notes                    text null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint erp_proj_ctrl_fc_amounts_nonneg
    check (forecast_to_complete >= 0 and forecast_revenue >= 0),
  constraint erp_proj_ctrl_fc_company_period_fk
    foreign key (company_id, period_id)
    references public.erp_proj_control_periods (company_id, id)
    on delete cascade,
  constraint erp_proj_ctrl_fc_company_project_fk
    foreign key (company_id, project_id)
    references public.erp_proj_projects (company_id, id)
    on delete restrict,
  constraint erp_proj_ctrl_fc_subchapter_fk
    foreign key (control_subchapter_id)
    references public.erp_proj_control_subchapters (id)
    on delete cascade,
  constraint erp_proj_ctrl_fc_resource_fk
    foreign key (control_resource_id)
    references public.erp_proj_control_resources (id)
    on delete set null
);

create unique index if not exists erp_proj_ctrl_fc_period_cuts_uq
  on public.erp_proj_control_forecasts (
    company_id,
    period_id,
    control_subchapter_id,
    coalesce(control_resource_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

drop trigger if exists erp_proj_ctrl_fc_updated_at on public.erp_proj_control_forecasts;
create trigger erp_proj_ctrl_fc_updated_at
  before update on public.erp_proj_control_forecasts
  for each row execute function public.set_updated_at();

comment on table public.erp_proj_control_forecasts is
  'צפי לגמר ידני לכל (תקופה, תת-פרק, משאב). MedaTech §6.3.8 (הכנסות) + §6.3.9 (הוצאות).';

alter table public.erp_proj_control_forecasts enable row level security;
drop policy if exists erp_proj_ctrl_fc_select on public.erp_proj_control_forecasts;
create policy erp_proj_ctrl_fc_select on public.erp_proj_control_forecasts
  for select using (public.user_has_company_access(company_id));
drop policy if exists erp_proj_ctrl_fc_modify on public.erp_proj_control_forecasts;
create policy erp_proj_ctrl_fc_modify on public.erp_proj_control_forecasts
  for all using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- ============================================================================
-- 5. RPC erp_collect_costs — איסוף עלויות לתקופת בקרה (MedaTech §6.3.5)
-- ============================================================================
-- הקלט: company_id, project_id, control_month.
-- הפעולה:
--   1) מאתר את תקופת הבקרה (כבר פתוחה ע"י server action).
--   2) מוחק snapshot קיים לתקופה זו.
--   3) בונה את רשימת החתכים (subchapter, resource) מכל מקורות העלות.
--   4) לכל חתך מחשב 6 קומפוננטות: original/current budget + committed (PO + contracts) + actual (invoices + subbills) + approved.
--   5) טוען את ה-forecast הידני מ-erp_proj_control_forecasts.
--   6) מבצע INSERT ... RETURNING לכל החתכים.
-- Returns: מספר השורות שנכתבו.
-- ============================================================================
create or replace function public.erp_collect_costs(
  p_company_id    text,
  p_project_id    uuid,
  p_control_month text
)
returns integer
language plpgsql
security invoker
as $$
declare
  v_period_id         uuid;
  v_zero_edition_id   uuid;
  v_exec_edition_id   uuid;
  v_rows_written      integer := 0;
begin
  if not public.user_has_company_access(p_company_id) then
    raise exception 'erp_collect_costs: אין הרשאה לחברה %', p_company_id
      using errcode = '42501';
  end if;

  -- מאתר את תקופת הבקרה
  select id into v_period_id
  from public.erp_proj_control_periods
  where company_id = p_company_id
    and project_id = p_project_id
    and control_month = p_control_month
  limit 1;

  if v_period_id is null then
    raise exception 'erp_collect_costs: תקופת בקרה לא נמצאה עבור % חודש %',
      p_project_id, p_control_month
      using errcode = '22023';
  end if;

  -- מאתר את המהדורות הרלוונטיות
  select id into v_zero_edition_id
  from public.erp_proj_planning_versions
  where company_id = p_company_id
    and project_id = p_project_id
    and is_base_version = true
  limit 1;

  select id into v_exec_edition_id
  from public.erp_proj_planning_versions
  where company_id = p_company_id
    and project_id = p_project_id
    and is_execution_version = true
  limit 1;

  -- אם אין מהדורת ביצוע, משתמש במהדורת האפס כקיימת
  if v_exec_edition_id is null then
    v_exec_edition_id := v_zero_edition_id;
  end if;

  -- מנקה snapshot ישנים לתקופה זו
  delete from public.erp_proj_control_period_snapshots
  where company_id = p_company_id and period_id = v_period_id;

  -- בונה טבלה זמנית של כל החתכים (subchapter, resource) מכל המקורות
  -- ואז aggregations חישובים לכל חתך.
  with
  -- תקציב מקורי מ-Zero Edition (Σ BOM × qty)
  original_budget as (
    select
      boq.control_subchapter_id as sub_id,
      bom.resource_id           as res_id,    -- FK to erp_proj_control_resources
      sum(bom.per_unit_cost * boq.quantity)::numeric(18,2) as amt
    from public.erp_proj_boq_resources bom
    join public.erp_proj_boq_lines boq on boq.id = bom.boq_line_id
    where boq.company_id = p_company_id
      and boq.project_id = p_project_id
      and boq.version_id = v_zero_edition_id
      and boq.control_subchapter_id is not null
    group by boq.control_subchapter_id, bom.resource_id
  ),
  -- תקציב עדכני מ-Execution Edition
  current_budget as (
    select
      boq.control_subchapter_id as sub_id,
      bom.resource_id           as res_id,
      sum(bom.per_unit_cost * boq.quantity)::numeric(18,2) as amt
    from public.erp_proj_boq_resources bom
    join public.erp_proj_boq_lines boq on boq.id = bom.boq_line_id
    where boq.company_id = p_company_id
      and boq.project_id = p_project_id
      and boq.version_id = v_exec_edition_id
      and boq.control_subchapter_id is not null
    group by boq.control_subchapter_id, bom.resource_id
  ),
  -- התחייבויות — PO lines (APPROVED+) with control dimensions
  committed_po as (
    select
      pol.control_subchapter_id as sub_id,
      pol.control_resource_id   as res_id,
      sum(pol.total_price)::numeric(18,2) as amt
    from public.erp_purchase_order_lines pol
    join public.erp_purchase_orders po on po.id = pol.purchase_order_id
    where pol.company_id = p_company_id
      and pol.project_id = p_project_id
      and pol.control_subchapter_id is not null
      and po.status in (
        'APPROVED','SENT_TO_SUPPLIER','SENT','PARTIALLY_RECEIVED',
        'FULLY_RECEIVED','CLOSED'
      )
    group by pol.control_subchapter_id, pol.control_resource_id
  ),
  -- התחייבויות — subcontractor contracts (active) + amendments
  committed_contracts as (
    select
      sc.default_control_subchapter_id as sub_id,
      sc.default_control_resource_id   as res_id,
      sum(sc.total_amount)::numeric(18,2) as amt
    from public.erp_subcontractor_contracts sc
    where sc.company_id = p_company_id
      and sc.project_id = p_project_id
      and sc.default_control_subchapter_id is not null
      and sc.status in ('ACTIVE','COMPLETED')
    group by sc.default_control_subchapter_id, sc.default_control_resource_id
  ),
  committed_amendments as (
    select
      coalesce(am.control_subchapter_id, sc.default_control_subchapter_id) as sub_id,
      coalesce(am.control_resource_id,   sc.default_control_resource_id)   as res_id,
      sum(am.value_delta)::numeric(18,2) as amt
    from public.erp_contract_amendments am
    join public.erp_subcontractor_contracts sc on sc.id = am.contract_id
    where am.company_id = p_company_id
      and sc.project_id = p_project_id
      and am.status = 'APPROVED'
      and coalesce(am.control_subchapter_id, sc.default_control_subchapter_id) is not null
    group by
      coalesce(am.control_subchapter_id, sc.default_control_subchapter_id),
      coalesce(am.control_resource_id,   sc.default_control_resource_id)
  ),
  -- בפועל — vendor invoices approved
  actual_invoices as (
    select
      vil.control_subchapter_id as sub_id,
      vil.control_resource_id   as res_id,
      sum(vil.total_price)::numeric(18,2) as amt
    from public.erp_vendor_invoice_lines vil
    join public.erp_vendor_invoices vi on vi.id = vil.vendor_invoice_id
    where vil.company_id = p_company_id
      and vil.project_id = p_project_id
      and vil.control_subchapter_id is not null
      and vi.status in ('APPROVED','READY_FOR_PAYMENT','FINAL')
    group by vil.control_subchapter_id, vil.control_resource_id
  ),
  -- בפועל — subcontractor bills approved (distributed by contract defaults)
  actual_subbills as (
    select
      sc.default_control_subchapter_id as sub_id,
      sc.default_control_resource_id   as res_id,
      sum(sb.cumulative_net_amount)::numeric(18,2) as amt
    from public.erp_subcontractor_bills sb
    join public.erp_subcontractor_contracts sc on sc.id = sb.contract_id
    where sb.company_id = p_company_id
      and sb.project_id = p_project_id
      and sc.default_control_subchapter_id is not null
      and sb.status in ('APPROVED','PAID')
      and sb.bill_date <= (
        select period_end_date from public.erp_proj_control_periods
        where id = v_period_id
      )
    group by sc.default_control_subchapter_id, sc.default_control_resource_id
  ),
  -- איחוד כל החתכים
  all_cuts as (
    select sub_id, res_id from original_budget
    union
    select sub_id, res_id from current_budget
    union
    select sub_id, res_id from committed_po
    union
    select sub_id, res_id from committed_contracts
    union
    select sub_id, res_id from committed_amendments
    union
    select sub_id, res_id from actual_invoices
    union
    select sub_id, res_id from actual_subbills
  )
  insert into public.erp_proj_control_period_snapshots (
    company_id, period_id, project_id,
    control_subchapter_id, control_resource_id,
    original_budget_amount, current_budget_amount,
    committed_po_amount, committed_contracts_amount,
    actual_invoices_amount, actual_subbills_amount,
    approved_in_books_amount, approved_off_books_amount,
    forecast_to_complete_amount,
    collected_at
  )
  select
    p_company_id,
    v_period_id,
    p_project_id,
    ac.sub_id,
    ac.res_id,
    coalesce(ob.amt, 0),
    coalesce(cb.amt, 0),
    coalesce(cp.amt, 0),
    coalesce(cc.amt, 0) + coalesce(ca.amt, 0),    -- contracts + amendments
    coalesce(ai.amt, 0),
    coalesce(asb.amt, 0),
    coalesce(ai.amt, 0) + coalesce(asb.amt, 0),   -- approved_in_books = sum of actuals
    0,                                            -- approved_off_books (to be populated later)
    coalesce(fc.forecast_to_complete, 0),
    now()
  from all_cuts ac
  left join original_budget      ob  on ob.sub_id  = ac.sub_id and ob.res_id  is not distinct from ac.res_id
  left join current_budget       cb  on cb.sub_id  = ac.sub_id and cb.res_id  is not distinct from ac.res_id
  left join committed_po         cp  on cp.sub_id  = ac.sub_id and cp.res_id  is not distinct from ac.res_id
  left join committed_contracts  cc  on cc.sub_id  = ac.sub_id and cc.res_id  is not distinct from ac.res_id
  left join committed_amendments ca  on ca.sub_id  = ac.sub_id and ca.res_id  is not distinct from ac.res_id
  left join actual_invoices      ai  on ai.sub_id  = ac.sub_id and ai.res_id  is not distinct from ac.res_id
  left join actual_subbills      asb on asb.sub_id = ac.sub_id and asb.res_id is not distinct from ac.res_id
  left join public.erp_proj_control_forecasts fc
    on fc.period_id              = v_period_id
   and fc.control_subchapter_id  = ac.sub_id
   and fc.control_resource_id is not distinct from ac.res_id;

  get diagnostics v_rows_written = row_count;

  -- מעדכן את התקופה ל-COLLECTED
  update public.erp_proj_control_periods
  set status = 'COLLECTED', collected_at = now()
  where id = v_period_id;

  return v_rows_written;
end;
$$;

comment on function public.erp_collect_costs(text, uuid, text) is
  'MedaTech §6.3.5 — איסוף עלויות לתקופת בקרה. מוחק snapshot קיים ומחשב מחדש מכל מקורות העלות.';

-- ============================================================================
-- 6. Seed דמו — קישור שורות דמו + תקופת בקרה ראשונה
-- ============================================================================
-- מזהים קבועים (חייבים להתאים ל-types/erp.ts):
--   DEMO_CONTRACT_PROJECT_ID     = c0700000-0000-4000-8000-aaaaaaaaaaaa
--   (מזהי subchapter + resource נלקחים מ- A.4 seed — חייבים להתאים):
--   CONTROL_SUBCHAPTER_ID        = c0700000-0000-4001-8000-000000000011
--   CONTROL_RESOURCE_ID          = c0700000-0000-4001-8000-000000001001  (קבלן חשמל)
--   DEMO_CONTROL_PERIOD_ID       = c0700000-0000-4006-8000-000000000000  (04/26)
do $$
declare
  v_company_id               text   := 'demo';
  v_project_id               uuid   := 'c0700000-0000-4000-8000-aaaaaaaaaaaa';
  v_subchapter_id            uuid   := 'c0700000-0000-4001-8000-000000000011';
  v_resource_id              uuid   := 'c0700000-0000-4001-8000-000000001001';
  v_period_id                uuid   := 'c0700000-0000-4006-8000-000000000000';
  v_project_exists           boolean;
  v_subchapter_exists        boolean;
begin
  -- בדיקות מקדימות — ה-seed רץ רק אם התשתית מ-A.4 קיימת
  select exists(
    select 1 from public.erp_proj_projects
    where company_id = v_company_id and id = v_project_id
  ) into v_project_exists;

  select exists(
    select 1 from public.erp_proj_control_subchapters
    where id = v_subchapter_id
  ) into v_subchapter_exists;

  if not v_project_exists or not v_subchapter_exists then
    raise notice 'Sprint A.5 seed: דילוג — תשתית A.4 חסרה (project=%, subchapter=%)',
      v_project_exists, v_subchapter_exists;
    return;
  end if;

  -- 6.1 שיוך default_control לחוזה קבלן משנה הדמו (אם קיים)
  update public.erp_subcontractor_contracts
  set
    default_control_subchapter_id = v_subchapter_id,
    default_control_resource_id   = v_resource_id
  where company_id = v_company_id
    and project_id = v_project_id
    and default_control_subchapter_id is null;

  -- 6.2 שיוך לשורות PO הדמו (אם קיימות)
  update public.erp_purchase_order_lines
  set
    control_subchapter_id = v_subchapter_id,
    control_resource_id   = v_resource_id
  where company_id = v_company_id
    and project_id = v_project_id
    and control_subchapter_id is null;

  -- 6.3 שיוך לשורות vendor-invoice הדמו (אם קיימות)
  update public.erp_vendor_invoice_lines
  set
    control_subchapter_id = v_subchapter_id,
    control_resource_id   = v_resource_id
  where company_id = v_company_id
    and project_id = v_project_id
    and control_subchapter_id is null;

  -- 6.4 יצירת תקופת בקרה דמו — 04/26
  insert into public.erp_proj_control_periods (
    id, company_id, project_id, control_month, period_end_date, status, notes
  ) values (
    v_period_id, v_company_id, v_project_id, '04/26', '2026-04-30',
    'OPEN', 'תקופת בקרה דמו — Sprint A.5 (אפריל 2026).'
  ) on conflict (id) do nothing;

  -- 6.5 forecast דמו ידני: 15,000 ₪ צפי לגמר עד סוף הפרויקט
  insert into public.erp_proj_control_forecasts (
    company_id, period_id, project_id,
    control_subchapter_id, control_resource_id,
    forecast_to_complete, forecast_revenue, notes
  ) values (
    v_company_id, v_period_id, v_project_id,
    v_subchapter_id, v_resource_id,
    15000, 0, 'צפי לגמר ידני לדוגמה — חודש 04/26.'
  ) on conflict (company_id, period_id, control_subchapter_id, coalesce(control_resource_id, '00000000-0000-0000-0000-000000000000'::uuid))
    do nothing;

  -- 6.6 הרצת איסוף עלויות אוטומטית לתקופה (כך שה-Cockpit יראה מספרים מיד)
  perform public.erp_collect_costs(v_company_id, v_project_id, '04/26');

  raise notice 'Sprint A.5 seed: יצר תקופת בקרה 04/26 והריץ איסוף עלויות ראשוני.';
end;
$$;
