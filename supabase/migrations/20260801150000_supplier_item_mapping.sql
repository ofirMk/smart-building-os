-- =============================================================================
-- Phase 7.4.5 — Supplier ↔ Master SKU Mapping Table
--
-- מטרה
--   להמיר טקסט חופשי של ספק ("צינור 20 ירוק") למזהה Master SKU בקטלוג שלנו.
--   זוהי הטבלה שעליה Cross-Supplier Optimizer (7.5) ו-Semantic Matcher (7.10.1)
--   ייבנו. ללא טבלה זו אין השוואת מחירים חוצת-ספקים.
--
-- תאימות לאחור
--   טבלה חדשה לחלוטין; לא נוגע בעמודה הקיימת erp_purchase_order_lines.item_sku
--   (זו תישאר free-text כפי שהיא, אבל החל מ-7.5 ימופה ל-master_item_id).
-- =============================================================================

create table if not exists public.erp_md_supplier_item_mapping (
  id                   uuid primary key default gen_random_uuid(),
  company_id           text not null references public.erp_companies(id) on delete restrict,
  supplier_id          uuid not null references public.erp_md_suppliers(id) on delete cascade,
  supplier_sku         varchar(128) not null,
  master_item_id       uuid not null references public.erp_md_items(id) on delete cascade,

  -- Supplier-side metadata (catalog snapshot)
  supplier_description text,
  supplier_unit_price  numeric(14,4),
  supplier_currency    varchar(3) default 'ILS',
  supplier_uom         varchar(16),
  supplier_min_qty     numeric(14,3),
  supplier_lead_time_days integer,

  -- Match metadata
  confidence           numeric(4,3) check (confidence is null or (confidence between 0 and 1)),
  matched_by_ai        boolean not null default false,
  verified_by_user     boolean not null default false,
  verified_by_user_id  uuid references auth.users(id) on delete set null,
  verified_at          timestamptz,

  -- Temporal validity (catalog versioning)
  valid_from           date not null default current_date,
  valid_to             date,

  -- Explainability (Phase 7.10.1)
  reasoning_json       jsonb,
  model_provider       text,
  model_name           text,
  model_version        text,

  -- Source provenance
  source_type          text check (source_type is null or source_type in
                          ('SUPPLIER_CATALOG','INVOICE_OCR','MANUAL_ENTRY','HISTORICAL_PURCHASE','RFQ_RESPONSE')),
  source_reference     text,  -- URL/file path/PO number

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint erp_md_supplier_item_mapping_validity_chk
    check (valid_to is null or valid_to >= valid_from)
);

-- מפתח ייחודיות אקטיבי: לא יכולים להיות שני mappings אקטיביים לאותו (company,supplier,sku).
-- (תוקפו של valid_to=NULL = "פעיל")
create unique index if not exists erp_md_supplier_item_mapping_active_uq
  on public.erp_md_supplier_item_mapping (company_id, supplier_id, supplier_sku)
  where valid_to is null;

-- אינדקסים לשליפות עיקריות
create index if not exists erp_md_supplier_item_mapping_master_idx
  on public.erp_md_supplier_item_mapping (company_id, master_item_id, supplier_id)
  where valid_to is null;

create index if not exists erp_md_supplier_item_mapping_supplier_idx
  on public.erp_md_supplier_item_mapping (company_id, supplier_id, valid_from desc);

-- אינדקס למיפויים שממתינים ל-human review (confidence ביניוני)
create index if not exists erp_md_supplier_item_mapping_review_queue_idx
  on public.erp_md_supplier_item_mapping (company_id, verified_by_user, confidence)
  where verified_by_user = false and confidence is not null and confidence < 0.90;

comment on table public.erp_md_supplier_item_mapping is
  'גשר Supplier-SKU ↔ Master-SKU. ה-SoT עבור Cross-Supplier Optimizer (7.5) ו-Semantic Matcher (7.10.1). תומך בגרסאות זמניות ו-explainability.';
comment on column public.erp_md_supplier_item_mapping.confidence is
  '0.0–1.0. >= 0.90 → auto-applied (Tier A). 0.70–0.89 → Tier B (review). < 0.70 → Tier C (rejected).';
comment on column public.erp_md_supplier_item_mapping.valid_to is
  'NULL = mapping פעיל. ברגע שספק משנה SKU או חוזה — מסתיים בתאריך השינוי, mapping חדש נוצר.';
comment on column public.erp_md_supplier_item_mapping.reasoning_json is
  'Chain-of-thought של ה-AI agent. דרוש לexplainability רגולטורי.';

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.erp_md_supplier_item_mapping enable row level security;

drop policy if exists erp_md_supplier_item_mapping_tenant_isolation on public.erp_md_supplier_item_mapping;
create policy erp_md_supplier_item_mapping_tenant_isolation
  on public.erp_md_supplier_item_mapping
  for all
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop trigger if exists erp_md_supplier_item_mapping_touch_updated_at_trg on public.erp_md_supplier_item_mapping;
create trigger erp_md_supplier_item_mapping_touch_updated_at_trg
  before update on public.erp_md_supplier_item_mapping
  for each row
  execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- View נוחה: mappings אקטיביים בלבד (יקל על שאילתות 7.5)
-- -----------------------------------------------------------------------------
create or replace view public.v_erp_supplier_item_mapping_active as
select *
from public.erp_md_supplier_item_mapping
where valid_to is null;

comment on view public.v_erp_supplier_item_mapping_active is
  'mappings אקטיביים בלבד — שימוש מומלץ ב-7.5 cross-supplier queries.';
