-- =============================================================================
-- Phase 8.3 · Step 1 — 3-Way Match Foundation (Data Layer + Match Engine)
-- =============================================================================
-- מה שיש כבר (מיפוי השטח לפני שינויים)
--   • `erp_vendor_invoices` (Phase 6) — header חשבונית ספק. יש status enum
--     `erp_vendor_invoice_status` עם 'DRAFT','FINAL','CANCELLED'.
--   • `erp_vendor_invoice_lines` — שורות עם `goods_receipt_line_id` (nullable
--     FK ל-erp_goods_receipt_lines). אין קישור ישיר ל-PO.
--   • `erp_vendor_invoice_receipts` — גשר header → GR header.
--   • `mo_supplier_invoices` / `mo_supplier_invoice_items` (legacy Holden) —
--     לא מטופלים פה. נשארים כ-compat; כל הדשבורדים החדשים עובדים על
--     `erp_vendor_invoices` בלבד.
--
-- מה מוסיפים (אדיטיבי לחלוטין — אין drop)
--   1. הרחבת enum `erp_vendor_invoice_status` ב-NEW, MATCHED, HAS_VARIANCES,
--      APPROVED, READY_FOR_PAYMENT. הערכים הישנים נשארים.
--   2. קישור ישיר ל-PO על ה-header וה-lines:
--        erp_vendor_invoices.purchase_order_id  (nullable FK)
--        erp_vendor_invoices.goods_receipt_id   (nullable FK)
--        erp_vendor_invoice_lines.purchase_order_line_id (nullable FK)
--   3. enum חדש `erp_invoice_match_line_status` עם PERFECT / QTY_VARIANCE /
--      PRICE_VARIANCE / MIXED_VARIANCE.
--   4. טבלת הגישור `erp_invoice_po_line_matches` — הלב של ה-3-Way Match.
--      UNIQUE per invoice_line_id (1:1 עם השורה → מאפשר upsert נקי).
--   5. RPC `erp_perform_3way_match(p_invoice_id uuid)` — idempotent.
--      DELETE+INSERT של כל ה-matches לחשבונית, חישוב סטטוס שורה, עדכון
--      `erp_vendor_invoices.status` ל-MATCHED / HAS_VARIANCES לפי התוצאה.
--
-- תאימות לאחור (SOX)
--   • ה-RPC לא נוגע בסטטוסים 'APPROVED' או 'READY_FOR_PAYMENT' — ברגע
--     שמנהל כספים אישר ידנית, הריצה מחדש לא תוריד את זה.
--   • 'CANCELLED' — לא תופעל הלוגיקה (מחזיר 'לא ניתן לבצע match').
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) הרחבת enum הסטטוסים של חשבונית ספק
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_type where typname = 'erp_vendor_invoice_status') then
    alter type public.erp_vendor_invoice_status add value if not exists 'NEW';
    alter type public.erp_vendor_invoice_status add value if not exists 'MATCHED';
    alter type public.erp_vendor_invoice_status add value if not exists 'HAS_VARIANCES';
    alter type public.erp_vendor_invoice_status add value if not exists 'APPROVED';
    alter type public.erp_vendor_invoice_status add value if not exists 'READY_FOR_PAYMENT';
  end if;
end$$;

-- -----------------------------------------------------------------------------
-- 2) קישור ישיר לחשבוניות
-- -----------------------------------------------------------------------------
alter table public.erp_vendor_invoices
  add column if not exists purchase_order_id uuid
    references public.erp_purchase_orders (id) on delete set null,
  add column if not exists goods_receipt_id uuid
    references public.erp_goods_receipts (id) on delete set null;

comment on column public.erp_vendor_invoices.purchase_order_id is
  'Phase 8.3 — קישור header חשבונית ל-PO מקור. ברוב המקרים החשבונית מתייחסת ל-PO אחד; nullable כי יש תרחישי חשבוניות בלי PO (Direct AP).';
comment on column public.erp_vendor_invoices.goods_receipt_id is
  'Phase 8.3 — קישור header חשבונית ל-GR יחידה (אם החשבונית קשורה ל-GR ספציפית). שורות יכולות להתקשר ל-GR אחרת דרך goods_receipt_line_id — זה רק hint של ה-header.';

alter table public.erp_vendor_invoice_lines
  add column if not exists purchase_order_line_id uuid
    references public.erp_purchase_order_lines (id) on delete set null;

comment on column public.erp_vendor_invoice_lines.purchase_order_line_id is
  'Phase 8.3 — קישור ישיר לשורת PO לצורך 3-Way Match. אם null, ה-RPC ינסה להשלים דרך goods_receipt_line_id. אם גם הוא null — השורה נחשבת unmatched.';

create index if not exists erp_vendor_invoices_po_idx
  on public.erp_vendor_invoices (company_id, purchase_order_id);
create index if not exists erp_vendor_invoice_lines_po_line_idx
  on public.erp_vendor_invoice_lines (company_id, purchase_order_line_id);

-- -----------------------------------------------------------------------------
-- 3) enum של סטטוס שורת match
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_invoice_match_line_status') then
    create type public.erp_invoice_match_line_status as enum (
      'PERFECT',
      'QTY_VARIANCE',
      'PRICE_VARIANCE',
      'MIXED_VARIANCE'
    );
  end if;
end$$;

comment on type public.erp_invoice_match_line_status is
  'Phase 8.3 — תוצאת 3-Way Match ברמת שורה: PERFECT (הכל תואם), QTY_VARIANCE (כמות שחויבה ≠ כמות שנקלטה), PRICE_VARIANCE (מחיר יחידה ≠ מחיר PO), MIXED_VARIANCE (גם וגם).';

-- -----------------------------------------------------------------------------
-- 4) טבלת הגישור — הלב הפיננסי
-- -----------------------------------------------------------------------------
create table if not exists public.erp_invoice_po_line_matches (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.erp_companies (id) on delete restrict,
  invoice_id uuid not null references public.erp_vendor_invoices (id) on delete cascade,
  invoice_line_id uuid not null references public.erp_vendor_invoice_lines (id) on delete cascade,
  po_line_id uuid not null references public.erp_purchase_order_lines (id) on delete restrict,
  gr_line_id uuid null references public.erp_goods_receipt_lines (id) on delete set null,

  -- snapshots (מה היה בפועל ברגע ההשוואה — מאפשר audit גם אחרי עריכות)
  invoice_qty         numeric(18,3) not null default 0,
  invoice_unit_price  numeric(18,2) not null default 0,
  po_unit_price       numeric(18,2) not null default 0,
  po_ordered_qty      numeric(18,3) not null default 0,
  gr_received_qty     numeric(18,3) not null default 0,

  -- הסטיות (computed בזמן ההכנסה; לא generated כדי לאפשר snapshot בעתיד)
  -- המשתמש הגדיר:
  --   qty_diff   = invoice_qty - gr_received_qty (חויב על יותר/פחות ממה שקיבלנו)
  --   price_diff = invoice_unit_price - po_unit_price (חויב על מחיר אחר מהמוסכם)
  qty_diff            numeric(18,3) not null default 0,
  price_diff          numeric(18,2) not null default 0,

  match_status        public.erp_invoice_match_line_status not null default 'PERFECT',
  notes               text null,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint erp_invoice_po_line_matches_invoice_line_uq
    unique (company_id, invoice_line_id)
);

comment on table public.erp_invoice_po_line_matches is
  'Phase 8.3 — גשר פיננסי: שורת חשבונית → שורת PO (1:1), עם snapshots של invoice/PO/GR ועם qty_diff/price_diff מחושבים. UNIQUE(company_id,invoice_line_id) מאפשר upsert נקי ב-RPC erp_perform_3way_match.';

create index if not exists erp_invoice_po_line_matches_invoice_idx
  on public.erp_invoice_po_line_matches (company_id, invoice_id);
create index if not exists erp_invoice_po_line_matches_po_line_idx
  on public.erp_invoice_po_line_matches (company_id, po_line_id);
create index if not exists erp_invoice_po_line_matches_status_idx
  on public.erp_invoice_po_line_matches (company_id, match_status)
  where match_status <> 'PERFECT';

-- touch_updated_at trigger
drop trigger if exists erp_invoice_po_line_matches_touch_updated_at_trg
  on public.erp_invoice_po_line_matches;
create trigger erp_invoice_po_line_matches_touch_updated_at_trg
  before update on public.erp_invoice_po_line_matches
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 5) RLS
-- -----------------------------------------------------------------------------
alter table public.erp_invoice_po_line_matches enable row level security;

drop policy if exists erp_invoice_po_line_matches_tenant_isolation
  on public.erp_invoice_po_line_matches;
create policy erp_invoice_po_line_matches_tenant_isolation
  on public.erp_invoice_po_line_matches for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

grant select, insert, update, delete on public.erp_invoice_po_line_matches to authenticated;

-- -----------------------------------------------------------------------------
-- 6) RPC: erp_perform_3way_match
-- -----------------------------------------------------------------------------
-- ## סמנטיקה
--   • עבור כל שורת חשבונית:
--       - משיג po_line_id (ישיר → אחרת דרך goods_receipt_line_id).
--       - משיג unit_price, quantity משורת ה-PO.
--       - משיג received_qty (rollup מ-erp_purchase_order_lines.received_qty,
--         שמתעדכן אוטומטית ב-RPC erp_complete_goods_receipt של Phase 8.2).
--       - מחשב qty_diff, price_diff.
--       - קובע match_status על פי ספי-סובלנות (epsilon: 0.001 כמות,
--         0.005 מחיר — חצי אגורה).
--   • שורות בלי לינק ל-PO → לא נכנסות לטבלת הגישור; נספרות ב-unmatched_lines.
--   • אחרי הכנסת כל ה-matches, הפונקציה קובעת את status ה-header:
--       - `APPROVED` / `READY_FOR_PAYMENT` / `CANCELLED` → לא נוגעים.
--       - כל השורות PERFECT ≥ 1 שורה נכנסה → `MATCHED`.
--       - ≥ שורה אחת עם variance → `HAS_VARIANCES`.
--       - 0 שורות נכנסו (כל החשבונית unmatched) → נשאר בסטטוס הנוכחי.
--
-- ## Idempotency
--   DELETE + INSERT של כל matches לחשבונית. קריאה חוזרת תחזיר תוצאה זהה
--   (בהנחה שה-state של ה-PO/GR לא השתנה). אין double-counting.
--
-- ## SECURITY DEFINER
--   הפונקציה מאמתת `user_has_company_access(company_id)` על ה-header של
--   החשבונית לפני כל פעולה. אחרת — exception 42501.
-- -----------------------------------------------------------------------------
create or replace function public.erp_perform_3way_match(p_invoice_id uuid)
returns table (
  invoice_id             uuid,
  new_invoice_status     text,
  total_invoice_lines    integer,
  matched_lines          integer,
  perfect_lines          integer,
  qty_variance_lines     integer,
  price_variance_lines   integer,
  mixed_variance_lines   integer,
  unmatched_lines        integer,
  total_qty_diff         numeric,
  total_price_diff_value numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id       text;
  v_current_status   public.erp_vendor_invoice_status;
  v_new_status       public.erp_vendor_invoice_status;
  v_total_lines      integer := 0;
  v_matched          integer := 0;
  v_perfect          integer := 0;
  v_qty_var          integer := 0;
  v_price_var        integer := 0;
  v_mixed_var        integer := 0;
  v_qty_sum          numeric(18,3) := 0;
  v_price_sum_value  numeric(18,2) := 0;

  -- ספי-סובלנות
  c_qty_eps   constant numeric := 0.001;
  c_price_eps constant numeric := 0.005;
begin
  -- ── א. אימות גישה ושליפת header ────────────────────────────────────────
  select company_id, status
    into v_company_id, v_current_status
  from public.erp_vendor_invoices
  where id = p_invoice_id
  for update;

  if v_company_id is null then
    raise exception 'חשבונית ספק % לא נמצאה', p_invoice_id using errcode = 'P0002';
  end if;

  if not public.user_has_company_access(v_company_id) then
    raise exception 'אין הרשאה לחברה % עבור חשבונית %', v_company_id, p_invoice_id
      using errcode = '42501';
  end if;

  if v_current_status = 'CANCELLED'::public.erp_vendor_invoice_status then
    raise exception 'לא ניתן לבצע 3-Way Match לחשבונית בסטטוס CANCELLED'
      using errcode = '22023';
  end if;

  -- ── ב. סך שורות בחשבונית (לצורך unmatched_lines) ─────────────────────
  select count(*) into v_total_lines
  from public.erp_vendor_invoice_lines
  where company_id = v_company_id
    and vendor_invoice_id = p_invoice_id;

  -- ── ג. ניקוי matches קיימים (Idempotency) ─────────────────────────────
  delete from public.erp_invoice_po_line_matches
  where company_id = v_company_id and invoice_id = p_invoice_id;

  -- ── ד. בניית snapshot + insert של matches ─────────────────────────────
  -- CTE שממפה לכל שורת חשבונית את שורת ה-PO המתאימה (ישיר או דרך GR line).
  with resolved as (
    select
      vil.id                            as invoice_line_id,
      vil.quantity                      as invoice_qty,
      vil.unit_price                    as invoice_unit_price,
      coalesce(vil.purchase_order_line_id, grl.purchase_order_line_id)
                                        as po_line_id_resolved,
      vil.goods_receipt_line_id         as gr_line_id
    from public.erp_vendor_invoice_lines vil
    left join public.erp_goods_receipt_lines grl
      on grl.id = vil.goods_receipt_line_id
     and grl.company_id = vil.company_id
    where vil.company_id = v_company_id
      and vil.vendor_invoice_id = p_invoice_id
  ),
  scored as (
    select
      r.invoice_line_id,
      r.invoice_qty,
      r.invoice_unit_price,
      r.po_line_id_resolved as po_line_id,
      r.gr_line_id,
      pol.quantity            as po_ordered_qty,
      pol.unit_price          as po_unit_price,
      coalesce(pol.received_qty, 0) as gr_received_qty,
      round(r.invoice_qty - coalesce(pol.received_qty, 0), 3)  as qty_diff,
      round(r.invoice_unit_price - pol.unit_price, 2)          as price_diff
    from resolved r
    join public.erp_purchase_order_lines pol
      on pol.id = r.po_line_id_resolved
     and pol.company_id = v_company_id
    where r.po_line_id_resolved is not null
  )
  insert into public.erp_invoice_po_line_matches (
    company_id,
    invoice_id,
    invoice_line_id,
    po_line_id,
    gr_line_id,
    invoice_qty,
    invoice_unit_price,
    po_unit_price,
    po_ordered_qty,
    gr_received_qty,
    qty_diff,
    price_diff,
    match_status
  )
  select
    v_company_id,
    p_invoice_id,
    s.invoice_line_id,
    s.po_line_id,
    s.gr_line_id,
    s.invoice_qty,
    s.invoice_unit_price,
    s.po_unit_price,
    s.po_ordered_qty,
    s.gr_received_qty,
    s.qty_diff,
    s.price_diff,
    case
      when abs(s.qty_diff) <= c_qty_eps and abs(s.price_diff) <= c_price_eps
        then 'PERFECT'::public.erp_invoice_match_line_status
      when abs(s.qty_diff) > c_qty_eps and abs(s.price_diff) > c_price_eps
        then 'MIXED_VARIANCE'::public.erp_invoice_match_line_status
      when abs(s.qty_diff) > c_qty_eps
        then 'QTY_VARIANCE'::public.erp_invoice_match_line_status
      else
        'PRICE_VARIANCE'::public.erp_invoice_match_line_status
    end
  from scored s;

  -- ── ה. סיכום ה-matches שנוצרו ─────────────────────────────────────────
  select
    count(*),
    count(*) filter (where match_status = 'PERFECT'),
    count(*) filter (where match_status = 'QTY_VARIANCE'),
    count(*) filter (where match_status = 'PRICE_VARIANCE'),
    count(*) filter (where match_status = 'MIXED_VARIANCE'),
    coalesce(sum(qty_diff), 0),
    coalesce(sum(price_diff * invoice_qty), 0)
  into
    v_matched, v_perfect, v_qty_var, v_price_var, v_mixed_var,
    v_qty_sum, v_price_sum_value
  from public.erp_invoice_po_line_matches
  where company_id = v_company_id and invoice_id = p_invoice_id;

  -- ── ו. עדכון סטטוס header (SOX: לא נוגעים ב-APPROVED/READY_FOR_PAYMENT) ─
  if v_current_status in (
    'APPROVED'::public.erp_vendor_invoice_status,
    'READY_FOR_PAYMENT'::public.erp_vendor_invoice_status
  ) then
    v_new_status := v_current_status;
  elsif v_matched = 0 then
    -- אין אפילו שורת match אחת — אין כלום לקבוע; משאירים סטטוס נוכחי.
    v_new_status := v_current_status;
  elsif v_perfect = v_matched then
    v_new_status := 'MATCHED'::public.erp_vendor_invoice_status;
  else
    v_new_status := 'HAS_VARIANCES'::public.erp_vendor_invoice_status;
  end if;

  if v_new_status is distinct from v_current_status then
    update public.erp_vendor_invoices
       set status = v_new_status
     where id = p_invoice_id and company_id = v_company_id;
  end if;

  -- ── ז. return ─────────────────────────────────────────────────────────
  return query select
    p_invoice_id,
    v_new_status::text,
    v_total_lines,
    v_matched,
    v_perfect,
    v_qty_var,
    v_price_var,
    v_mixed_var,
    (v_total_lines - v_matched)::integer  as unmatched_lines,
    v_qty_sum,
    v_price_sum_value;
end;
$$;

comment on function public.erp_perform_3way_match(uuid) is
  'Phase 8.3 — אטומית, idempotent: מחשבת 3-Way Match לחשבונית ספק, ממלאת את erp_invoice_po_line_matches (DELETE+INSERT), ומקדמת את erp_vendor_invoices.status ל-MATCHED / HAS_VARIANCES. לא נוגעת בסטטוסים APPROVED / READY_FOR_PAYMENT (SOX). ספי סובלנות: 0.001 לכמות, 0.005 (חצי אגורה) למחיר יחידה.';

grant execute on function public.erp_perform_3way_match(uuid) to authenticated;
