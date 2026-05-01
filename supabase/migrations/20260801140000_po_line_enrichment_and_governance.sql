-- =============================================================================
-- Phase 7.4 — Line Enrichment + AI Governance Columns
--
-- מטרה
--   1) הרחבת שורות PO לפיצ'רים של Priority (תאריך אספקה, הנחה, מטבע, מקור-מחיר).
--   2) הוספת עמודות AI Governance שצרכניות יהיו ב-7.5 (3% Rule) וב-7.7 (Approval).
--   3) הוספת urgency_level + AI-negotiation tracking ב-header.
--
-- תאימות לאחור
--   - Additive only. כל העמודות עם DEFAULT שמרני שלא משבר POs קיימים.
--   - אין שינוי NOT NULL על עמודות קיימות.
--
-- תלות
--   - 20260730120000 (financial breakdown) ✅
--   - 20260801130000 (AI platform foundations) ✅
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Header — urgency + AI negotiation tracking
-- -----------------------------------------------------------------------------
alter table public.erp_purchase_orders
  add column if not exists urgency_level text not null default 'NORMAL';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_purchase_orders_urgency_level_chk'
  ) then
    alter table public.erp_purchase_orders
      add constraint erp_purchase_orders_urgency_level_chk
        check (urgency_level in ('NORMAL','HIGH','CRITICAL'));
  end if;
end$$;

alter table public.erp_purchase_orders
  add column if not exists urgency_justification text;

alter table public.erp_purchase_orders
  add column if not exists ai_negotiation_status text not null default 'NOT_ATTEMPTED';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_purchase_orders_ai_negotiation_status_chk'
  ) then
    alter table public.erp_purchase_orders
      add constraint erp_purchase_orders_ai_negotiation_status_chk
        check (ai_negotiation_status in
          ('NOT_ATTEMPTED','IN_PROGRESS','SUCCEEDED','DECLINED','BYPASSED_URGENCY','DISABLED'));
  end if;
end$$;

alter table public.erp_purchase_orders
  add column if not exists ai_negotiated_savings   numeric(14,2);
alter table public.erp_purchase_orders
  add column if not exists ai_negotiation_log      jsonb default '[]'::jsonb;
alter table public.erp_purchase_orders
  add column if not exists rfq_id                  uuid;  -- FK יתווסף ב-7.10.3
alter table public.erp_purchase_orders
  add column if not exists general_discount_pct    numeric(5,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_purchase_orders_general_discount_pct_chk'
  ) then
    alter table public.erp_purchase_orders
      add constraint erp_purchase_orders_general_discount_pct_chk
        check (general_discount_pct between 0 and 100);
  end if;
end$$;

-- Header-level deviation tracking (חישוב ב-Phase 7.5)
alter table public.erp_purchase_orders
  add column if not exists po_total_deviation_pct  numeric(6,2);
alter table public.erp_purchase_orders
  add column if not exists requires_po_escalation  boolean not null default false;

comment on column public.erp_purchase_orders.urgency_level is
  'NORMAL/HIGH/CRITICAL. HIGH+ עוקפים את שלב ה-AI negotiation (לא את ה-Approval governance).';
comment on column public.erp_purchase_orders.ai_negotiation_status is
  'BYPASSED_URGENCY = לא הופעל בגלל urgency_level=HIGH/CRITICAL. DISABLED = ai_features_enabled.rfq_agent=false.';
comment on column public.erp_purchase_orders.requires_po_escalation is
  'מחושב ב-7.5 לפי max_allowed_po_total_deviation_pct של החברה. צרכן ב-7.7.';

-- -----------------------------------------------------------------------------
-- 2) Lines — Priority parity columns (date/discount/currency/source/manufacturer)
-- -----------------------------------------------------------------------------
alter table public.erp_purchase_order_lines
  add column if not exists supply_date         date;

alter table public.erp_purchase_order_lines
  add column if not exists discount_pct        numeric(5,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_purchase_order_lines_discount_pct_chk'
  ) then
    alter table public.erp_purchase_order_lines
      add constraint erp_purchase_order_lines_discount_pct_chk
        check (discount_pct between 0 and 100);
  end if;
end$$;

alter table public.erp_purchase_order_lines
  add column if not exists line_currency       varchar(3) not null default 'ILS';
alter table public.erp_purchase_order_lines
  add column if not exists exchange_rate       numeric(12,6) not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_purchase_order_lines_exchange_rate_chk'
  ) then
    alter table public.erp_purchase_order_lines
      add constraint erp_purchase_order_lines_exchange_rate_chk
        check (exchange_rate > 0);
  end if;
end$$;

alter table public.erp_purchase_order_lines
  add column if not exists price_source        text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_purchase_order_lines_price_source_chk'
  ) then
    alter table public.erp_purchase_order_lines
      add constraint erp_purchase_order_lines_price_source_chk
        check (price_source is null or price_source in
          ('SUPPLIER_PRICELIST','LAST_PURCHASE','MANUAL','QUOTE','FRAMEWORK','AI_CROSS_SUPPLIER'));
  end if;
end$$;

alter table public.erp_purchase_order_lines
  add column if not exists manufacturer_name   text;
alter table public.erp_purchase_order_lines
  add column if not exists line_notes          text;

-- -----------------------------------------------------------------------------
-- 3) Lines — AI Governance (3% Rule, will be populated by 7.5 logic)
-- -----------------------------------------------------------------------------
alter table public.erp_purchase_order_lines
  add column if not exists requires_escalation        boolean not null default false;

alter table public.erp_purchase_order_lines
  add column if not exists escalation_justification   text;

alter table public.erp_purchase_order_lines
  add column if not exists escalation_category        text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_purchase_order_lines_escalation_category_chk'
  ) then
    alter table public.erp_purchase_order_lines
      add constraint erp_purchase_order_lines_escalation_category_chk
        check (escalation_category is null or escalation_category in
          ('BUSINESS_RELATIONSHIP','QUALITY','AVAILABILITY','LEAD_TIME','OTHER'));
  end if;
end$$;

alter table public.erp_purchase_order_lines
  add column if not exists price_deviation_pct        numeric(6,2);

alter table public.erp_purchase_order_lines
  add column if not exists alternative_supplier_id    uuid
                             references public.erp_md_suppliers(id) on delete set null;

alter table public.erp_purchase_order_lines
  add column if not exists alternative_unit_price     numeric(14,4);

alter table public.erp_purchase_order_lines
  add column if not exists alternative_lead_time_days integer;

-- -----------------------------------------------------------------------------
-- 4) Trigger: enforce justification when requires_escalation=true
-- -----------------------------------------------------------------------------
create or replace function public.erp_po_lines_validate_escalation()
returns trigger
language plpgsql
as $$
begin
  if new.requires_escalation = true then
    if new.escalation_justification is null
       or length(trim(new.escalation_justification)) < 10 then
      raise exception 'requires_escalation=true mandates escalation_justification (>=10 chars).'
        using errcode = '23514';
    end if;
    if new.escalation_category is null then
      raise exception 'requires_escalation=true mandates escalation_category.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists erp_po_lines_validate_escalation_trg on public.erp_purchase_order_lines;
create trigger erp_po_lines_validate_escalation_trg
  before insert or update on public.erp_purchase_order_lines
  for each row
  execute function public.erp_po_lines_validate_escalation();

comment on column public.erp_purchase_order_lines.requires_escalation is
  'מסומן ע"י Smart Pricing Engine (7.5) כשהחריגה > max_allowed_line_deviation_pct של החברה.';
comment on column public.erp_purchase_order_lines.escalation_category is
  'BUSINESS_RELATIONSHIP / QUALITY / AVAILABILITY / LEAD_TIME / OTHER — לא adversarial.';
comment on column public.erp_purchase_order_lines.price_deviation_pct is
  'positive = יקר יותר מהאופציה הזולה ביותר; negative = זול יותר. מאוכלס ב-7.5.';

-- -----------------------------------------------------------------------------
-- 5) Indexes לתמיכה ב-queries של 7.5 (3% Rule + cross-supplier scan)
-- -----------------------------------------------------------------------------
create index if not exists erp_purchase_order_lines_escalation_idx
  on public.erp_purchase_order_lines (company_id, requires_escalation, created_at desc)
  where requires_escalation = true;

create index if not exists erp_purchase_orders_urgency_idx
  on public.erp_purchase_orders (company_id, urgency_level, created_at desc)
  where urgency_level <> 'NORMAL';
