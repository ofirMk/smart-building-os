-- =============================================================================
-- Phase 7.6 — Attachments + Rich Text PO Body (skeleton)
--
-- מטרה
--   1) erp_po_attachments — metadata של קבצים מצורפים (הקובץ עצמו ב-Supabase Storage).
--   2) body_html / body_html_english על erp_purchase_orders (Tiptap WYSIWYG).
--   3) קישור אופציונלי ל-master SKU assets (תמונה/datasheet/תו תקן).
--
-- Storage
--   Bucket 'po-attachments' (per-tenant RLS) ו-'master-sku-assets' (גלובלי, signed URLs).
--   יצירת ה-buckets נעשית דרך Supabase Dashboard או דרך CLI בפריסה.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) body_html columns על erp_purchase_orders
-- -----------------------------------------------------------------------------
alter table public.erp_purchase_orders
  add column if not exists body_html          text;
alter table public.erp_purchase_orders
  add column if not exists body_html_english  text;

comment on column public.erp_purchase_orders.body_html is
  'טקסט עשיר (Tiptap/ProseMirror HTML) שנשלח לספק. משמש גם לטקסט קבוע מה-PO-type.';
comment on column public.erp_purchase_orders.body_html_english is
  'מקבילה באנגלית לספקי חו"ל.';

-- -----------------------------------------------------------------------------
-- 2) erp_po_attachments — קבצים מצורפים ברמת PO
-- -----------------------------------------------------------------------------
create table if not exists public.erp_po_attachments (
  id                    uuid primary key default gen_random_uuid(),
  company_id            text not null references public.erp_companies(id) on delete restrict,
  purchase_order_id     uuid not null references public.erp_purchase_orders(id) on delete cascade,

  file_name             text not null,
  storage_path          text not null,  -- path ב-bucket 'po-attachments'
  storage_bucket        text not null default 'po-attachments',
  mime_type             text,
  size_bytes            bigint check (size_bytes is null or size_bytes >= 0),
  sha256                text,  -- dedup

  description           text,
  visible_to_supplier   boolean not null default false,
                          -- האם הקובץ ייחשף לספק בפורטל (Phase 7.11)

  uploaded_by           uuid references auth.users(id) on delete set null,
  uploaded_at           timestamptz not null default now(),

  -- קישור אופציונלי לגרסה של ה-PO (Phase 7.8)
  po_revision_number    integer,

  created_at            timestamptz not null default now()
);

create index if not exists erp_po_attachments_po_idx
  on public.erp_po_attachments (company_id, purchase_order_id, uploaded_at desc);

comment on table public.erp_po_attachments is
  'Metadata של קבצים מצורפים ל-PO. הקבצים עצמם ב-bucket po-attachments (per-tenant RLS). sha256 למניעת כפילויות.';

alter table public.erp_po_attachments enable row level security;

drop policy if exists erp_po_attachments_tenant_isolation on public.erp_po_attachments;
create policy erp_po_attachments_tenant_isolation
  on public.erp_po_attachments
  for all
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- -----------------------------------------------------------------------------
-- 3) erp_md_item_assets — קבצי enrichment גלובליים של ה-Master SKU
--    (שונה מ-erp_po_attachments: אלו גלובליים לכל הלקוחות, לא per-PO/tenant)
-- -----------------------------------------------------------------------------
create table if not exists public.erp_md_item_assets (
  id                 uuid primary key default gen_random_uuid(),
  master_item_id     uuid not null references public.erp_md_items(id) on delete cascade,

  asset_type         text not null check (asset_type in
                       ('PRIMARY_IMAGE','DATASHEET','STANDARD_CERT','SAFETY_DATA_SHEET','BROCHURE','OTHER')),
  storage_path       text not null,  -- path ב-bucket 'master-sku-assets'
  storage_bucket     text not null default 'master-sku-assets',
  mime_type          text,
  size_bytes         bigint check (size_bytes is null or size_bytes >= 0),
  sha256             text,

  -- מקור (SII = מכון התקנים; MANUFACTURER/DISTRIBUTOR/OTHER)
  source_type        text check (source_type is null or source_type in
                       ('SII','MANUFACTURER','DISTRIBUTOR','USER_UPLOAD','OTHER')),
  source_url         text,
  source_priority    smallint not null default 5,
                       -- 10=גבוה (SII לתקן), 1=נמוך. 7.10.2 ייגזר authority chain.

  -- Validity / freshness
  valid_until        timestamptz,
  last_checked_at    timestamptz,

  -- Enrichment metadata
  enriched_by_ai     boolean not null default false,
  verified_by_user   boolean not null default false,
  discovered_at      timestamptz not null default now(),

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists erp_md_item_assets_master_idx
  on public.erp_md_item_assets (master_item_id, asset_type, source_priority desc);

create index if not exists erp_md_item_assets_stale_idx
  on public.erp_md_item_assets (valid_until)
  where valid_until is not null;

comment on table public.erp_md_item_assets is
  'נכסים גלובליים של Master SKU (תמונות, datasheets, תווי תקן). bucket master-sku-assets, signed URLs. מאוכלס ע"י Data Enrichment Agent (7.10.2).';
comment on column public.erp_md_item_assets.source_type is
  'SII = מכון התקנים הישראלי (אוטוריטטיבי לתווי תקן). MANUFACTURER = דף היצרן.';
comment on column public.erp_md_item_assets.source_priority is
  'Authority chain: SII תקן > יצרן מקורי > מפיץ ראשי. 10=אוטוריטטיבי ביותר.';

-- ⚠️ ללא RLS פר-company — זוהי טבלת reference גלובלית לכל הלקוחות.
-- עם זאת, לא נפתחת ללא authentication (signed URL + auth check ב-API).
alter table public.erp_md_item_assets enable row level security;

drop policy if exists erp_md_item_assets_authenticated_read on public.erp_md_item_assets;
create policy erp_md_item_assets_authenticated_read
  on public.erp_md_item_assets
  for select
  using (auth.role() = 'authenticated');

-- Only service_role can write (via agents)
drop policy if exists erp_md_item_assets_service_write on public.erp_md_item_assets;
create policy erp_md_item_assets_service_write
  on public.erp_md_item_assets
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop trigger if exists erp_md_item_assets_touch_updated_at_trg on public.erp_md_item_assets;
create trigger erp_md_item_assets_touch_updated_at_trg
  before update on public.erp_md_item_assets
  for each row
  execute function public.touch_updated_at();
