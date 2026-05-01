-- =============================================================================
-- Phase 7.5 — Smart Pricing Engine + 3% Rule
--
-- מטרה
--   1) erp_po_approved_exceptions — זיכרון של חריגות מחיר מאושרות (משתיק
--      escalation חוזר על שילוב item+supplier שכבר אושר).
--   2) RPC: erp_compute_price_suggestions — מנוע ההצעות (stateless, AI-ready).
--   3) RPC: erp_compute_line_deviation — חישוב סטיית מחיר בזמן יצירת שורה.
--   4) Schema-lock ל-approval_chain_json (תיעוד פורמט; הלוגיקה ב-7.7).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) erp_po_approved_exceptions — Approved exception memory
-- -----------------------------------------------------------------------------
create table if not exists public.erp_po_approved_exceptions (
  id                    uuid primary key default gen_random_uuid(),
  company_id            text not null references public.erp_companies(id) on delete restrict,
  master_item_id        uuid not null references public.erp_md_items(id) on delete cascade,
  supplier_id           uuid not null references public.erp_md_suppliers(id) on delete cascade,
  project_id            uuid references public.erp_proj_projects(id) on delete cascade,
                          -- NULL = פטור גלובלי לכל פרויקט; אחרת מוגבל לפרויקט ספציפי
  max_deviation_pct     numeric(5,2),
                          -- NULL = פטור ללא תקרה; אחרת חריגה עד הסף הזה לא תדליק escalation
  escalation_category   text check (escalation_category is null or escalation_category in
                          ('BUSINESS_RELATIONSHIP','QUALITY','AVAILABILITY','LEAD_TIME','OTHER')),
  reason                text,
  approved_by_user_id   uuid references auth.users(id) on delete set null,
  approved_at           timestamptz not null default now(),
  valid_until           timestamptz,
  source_po_id          uuid references public.erp_purchase_orders(id) on delete set null,
                          -- ה-PO שבו אושרה החריגה במקור (ל-audit)
  created_at            timestamptz not null default now()
);

create index if not exists erp_po_approved_exceptions_lookup_idx
  on public.erp_po_approved_exceptions
     (company_id, master_item_id, supplier_id, valid_until);

comment on table public.erp_po_approved_exceptions is
  'זיכרון חריגות מאושרות. שורת PO חדשה עם שילוב (item,supplier) שכבר אושר → לא תפעיל escalation מחדש בתוך תקופת הפטור.';
comment on column public.erp_po_approved_exceptions.project_id is
  'NULL = פטור גלובלי. אחרת חל רק על הפרויקט הספציפי.';
comment on column public.erp_po_approved_exceptions.valid_until is
  'NULL = ללא תפוגה (לא מומלץ). מומלץ לקבוע 6-12 חודשים.';

alter table public.erp_po_approved_exceptions enable row level security;

drop policy if exists erp_po_approved_exceptions_tenant_isolation on public.erp_po_approved_exceptions;
create policy erp_po_approved_exceptions_tenant_isolation
  on public.erp_po_approved_exceptions
  for all
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- -----------------------------------------------------------------------------
-- 2) erp_compute_price_suggestions — מנוע הצעות מחיר רב-מקורי
--
-- מחזיר את ההצעות הזולות-המומלצות מכל המקורות הזמינים:
--   * SUPPLIER_PRICELIST    — הספק שנבחר, מ-supplier_item_mapping
--   * LAST_PURCHASE         — רכישה היסטורית מאותו ספק
--   * BEST_OFFER_CROSS      — ספק חליפי זול יותר (Master SKU mapping)
-- Stateless — אותם קלטים → אותו פלט.
-- Python agents יקראו דרך RPC (ב-7.10).
-- -----------------------------------------------------------------------------
create or replace function public.erp_compute_price_suggestions(
  p_company_id      text,
  p_master_item_id  uuid,
  p_supplier_id     uuid,
  p_quantity        numeric default 1,
  p_window_days     integer default null
)
returns table (
  source            text,
  supplier_id       uuid,
  supplier_name     text,
  unit_price        numeric(14,4),
  currency          varchar(3),
  effective_from    date,
  lead_time_days    integer,
  po_number         text,
  confidence        numeric(4,3)
)
language plpgsql
stable
security invoker
as $$
declare
  v_window integer;
begin
  -- חיפוש חלון ברירת מחדל מהגדרות החברה
  if p_window_days is null then
    select cross_supplier_price_window_days into v_window
    from public.erp_md_company_settings
    where company_id = p_company_id;
    v_window := coalesce(v_window, 90);
  else
    v_window := p_window_days;
  end if;

  return query
  -- מקור 1: מחירון פעיל של הספק שנבחר
  (
    select
      'SUPPLIER_PRICELIST'::text                 as source,
      sim.supplier_id                            as supplier_id,
      s.name                                     as supplier_name,
      sim.supplier_unit_price                    as unit_price,
      coalesce(sim.supplier_currency, 'ILS')     as currency,
      sim.valid_from                             as effective_from,
      sim.supplier_lead_time_days                as lead_time_days,
      null::text                                 as po_number,
      coalesce(sim.confidence, 0.95)::numeric(4,3) as confidence
    from public.v_erp_supplier_item_mapping_active sim
    join public.erp_md_suppliers s on s.id = sim.supplier_id
    where sim.company_id = p_company_id
      and sim.master_item_id = p_master_item_id
      and sim.supplier_id = p_supplier_id
      and sim.supplier_unit_price is not null
  )
  union all
  -- מקור 2: רכישה היסטורית אחרונה מהספק שנבחר
  (
    select
      'LAST_PURCHASE'::text                      as source,
      po.supplier_id                             as supplier_id,
      s.name                                     as supplier_name,
      pol.unit_price                             as unit_price,
      coalesce(pol.line_currency, 'ILS')         as currency,
      po.created_at::date                        as effective_from,
      null::integer                              as lead_time_days,
      po.po_number                               as po_number,
      0.90::numeric(4,3)                         as confidence
    from public.erp_purchase_order_lines pol
    join public.erp_purchase_orders po on po.id = pol.purchase_order_id
    join public.erp_md_suppliers s on s.id = po.supplier_id
    where pol.company_id = p_company_id
      and pol.item_id = p_master_item_id
      and po.supplier_id = p_supplier_id
      and po.created_at >= now() - (v_window || ' days')::interval
    order by po.created_at desc
    limit 5
  )
  union all
  -- מקור 3: ספקים חליפיים — Best offer cross-supplier
  (
    select
      'BEST_OFFER_CROSS'::text                   as source,
      sim.supplier_id                            as supplier_id,
      s.name                                     as supplier_name,
      sim.supplier_unit_price                    as unit_price,
      coalesce(sim.supplier_currency, 'ILS')     as currency,
      sim.valid_from                             as effective_from,
      sim.supplier_lead_time_days                as lead_time_days,
      null::text                                 as po_number,
      coalesce(sim.confidence, 0.85)::numeric(4,3) as confidence
    from public.v_erp_supplier_item_mapping_active sim
    join public.erp_md_suppliers s on s.id = sim.supplier_id
    where sim.company_id = p_company_id
      and sim.master_item_id = p_master_item_id
      and sim.supplier_id <> p_supplier_id
      and sim.supplier_unit_price is not null
      and (sim.supplier_min_qty is null or sim.supplier_min_qty <= p_quantity)
    order by sim.supplier_unit_price asc
    limit 5
  );
end;
$$;

comment on function public.erp_compute_price_suggestions is
  'מנוע הצעות מחיר רב-מקורי. Stateless. נצרך ע"י API /procurement/pricing/suggestions ועתידית ע"י Python AI agents (7.10).';

-- -----------------------------------------------------------------------------
-- 3) erp_compute_line_deviation — חישוב סטיית מחיר ב-3% Rule
--
-- מחזיר:
--   - lowest_alt_price (ספק חליפי זול ביותר)
--   - lowest_alt_supplier_id
--   - deviation_pct = ((selected - lowest) / lowest) * 100
--   - requires_escalation (true אם > line threshold ולא קיים approved exception)
-- -----------------------------------------------------------------------------
create or replace function public.erp_compute_line_deviation(
  p_company_id      text,
  p_master_item_id  uuid,
  p_supplier_id     uuid,
  p_unit_price      numeric,
  p_quantity        numeric default 1,
  p_project_id      uuid default null
)
returns table (
  lowest_alt_price        numeric(14,4),
  lowest_alt_supplier_id  uuid,
  lowest_alt_lead_time    integer,
  deviation_pct           numeric(6,2),
  requires_escalation     boolean,
  exception_applied       boolean,
  threshold_pct           numeric(5,2)
)
language plpgsql
stable
security invoker
as $$
declare
  v_threshold     numeric(5,2);
  v_lowest        numeric(14,4);
  v_lowest_sup    uuid;
  v_lowest_lead   integer;
  v_deviation     numeric(6,2);
  v_exception     boolean;
  v_requires      boolean;
begin
  -- 1) שליפת סף החריגה של החברה
  select max_allowed_line_deviation_pct into v_threshold
  from public.erp_md_company_settings
  where company_id = p_company_id;
  v_threshold := coalesce(v_threshold, 3.00);

  -- 2) חיפוש החלופה הזולה ביותר (לא הספק הנוכחי)
  select sim.supplier_unit_price, sim.supplier_id, sim.supplier_lead_time_days
    into v_lowest, v_lowest_sup, v_lowest_lead
  from public.v_erp_supplier_item_mapping_active sim
  where sim.company_id = p_company_id
    and sim.master_item_id = p_master_item_id
    and sim.supplier_id <> p_supplier_id
    and sim.supplier_unit_price is not null
    and (sim.supplier_min_qty is null or sim.supplier_min_qty <= p_quantity)
  order by sim.supplier_unit_price asc
  limit 1;

  -- 3) חישוב סטייה (חיובית = יקר יותר מהחלופה)
  if v_lowest is null or v_lowest = 0 then
    v_deviation := null;
  else
    v_deviation := round(((p_unit_price - v_lowest) / v_lowest) * 100, 2);
  end if;

  -- 4) בדיקה אם יש approved exception תקף
  v_exception := exists (
    select 1
    from public.erp_po_approved_exceptions e
    where e.company_id = p_company_id
      and e.master_item_id = p_master_item_id
      and e.supplier_id = p_supplier_id
      and (e.project_id is null or e.project_id = p_project_id)
      and (e.valid_until is null or e.valid_until > now())
      and (e.max_deviation_pct is null or e.max_deviation_pct >= coalesce(v_deviation, 0))
  );

  -- 5) האם דרושה הסלמה?
  v_requires := coalesce(v_deviation, 0) > v_threshold and not v_exception;

  return query select
    v_lowest, v_lowest_sup, v_lowest_lead,
    v_deviation, v_requires, v_exception, v_threshold;
end;
$$;

comment on function public.erp_compute_line_deviation is
  'מחשב סטיית מחיר ביחס לחלופה הזולה ביותר ומחזיר requires_escalation לפי כלל ה-3% של החברה. מפעיל גם זיכרון חריגות מאושרות.';

-- -----------------------------------------------------------------------------
-- 4) approval_chain_json — Schema lock (תיעוד פורמט; לוגיקה ב-7.7)
--
-- הפורמט המוסכם:
--   [
--     {
--       "level": 1,
--       "required_role": "PROJECT_MANAGER",
--       "amount_threshold_gross": null,
--       "trigger": "always"
--     },
--     {
--       "level": 2,
--       "required_role": "CFO",
--       "amount_threshold_gross": 50000,
--       "trigger": "amount_above OR requires_po_escalation"
--     },
--     {
--       "level": 3,
--       "required_role": "CEO",
--       "amount_threshold_gross": 250000,
--       "trigger": "amount_above"
--     }
--   ]
--
-- "trigger" — DSL מצומצם:
--   "always"
--   "amount_above"                      (משווה ל-amount_threshold_gross)
--   "requires_po_escalation"            (חריגה מסה"כ PO)
--   "any_line_requires_escalation"      (לפחות שורה אחת חורגת)
--   "urgency_high"                      (דחיפות גבוהה — דורש ratify)
--   ניתן לשרשר עם " OR " / " AND ".
-- -----------------------------------------------------------------------------
comment on column public.erp_md_po_types.approval_chain_json is
  'Array of {level, required_role, amount_threshold_gross, trigger}. trigger DSL: always | amount_above | requires_po_escalation | any_line_requires_escalation | urgency_high (chained with OR/AND). הלוגיקה מתממשת ב-Phase 7.7.';
