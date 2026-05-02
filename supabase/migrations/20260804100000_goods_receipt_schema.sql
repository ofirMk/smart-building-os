-- =============================================================================
-- Phase 8.2 — Goods Receipt (GR) Native Schema
-- =============================================================================
-- מטרה
--   להפוך את erp_goods_receipts / erp_goods_receipt_lines (Phase 6) למבנה
--   ראוי-קליטת-שטח: שדות תעודת משלוח של הספק, מי קיבל ומתי, פיצול
--   received_qty / rejected_qty + reject_reason, ועיגון של "כמה כבר התקבל
--   בפועל" ב-erp_purchase_order_lines.received_qty כדי שכל רכיב במערכת
--   יוכל לשאול "כמה נותר לקבל?" ב-O(1).
--
--   בנוסף — RPC `erp_complete_goods_receipt(p_gr_id)` שמבצע את כל הסגירה
--   בעסקה אחת אטומית: מעדכן status, מבצע rollup לכמויות PO, ומגלגל את
--   סטטוס ה-PO ל-PARTIALLY_RECEIVED / FULLY_RECEIVED.
--
-- אדיטיבי לחלוטין — לא נוגע בערכי enum קיימים, לא הופך ל-NOT NULL עמודות
-- ישנות. פותח דרך לקוד החדש בלי לשבור את ה-Phase 6 הוותיק.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) הרחבת ה-enums
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_type where typname = 'erp_goods_receipt_status') then
    alter type public.erp_goods_receipt_status
      add value if not exists 'COMPLETED' after 'DRAFT';
  end if;
end$$;

do $$
begin
  if exists (select 1 from pg_type where typname = 'erp_purchase_order_status') then
    -- after SENT_TO_SUPPLIER (מ-Phase 8.1.4) — מסלול פיזי-לוגיסטי טבעי.
    alter type public.erp_purchase_order_status
      add value if not exists 'PARTIALLY_RECEIVED' after 'SENT_TO_SUPPLIER';
    alter type public.erp_purchase_order_status
      add value if not exists 'FULLY_RECEIVED' after 'PARTIALLY_RECEIVED';
  end if;
end$$;

-- -----------------------------------------------------------------------------
-- 2) erp_goods_receipts — שדות שטח/אודיט (idempotent)
-- -----------------------------------------------------------------------------
alter table public.erp_goods_receipts
  add column if not exists vendor_delivery_note text,
  add column if not exists received_at timestamptz,
  add column if not exists received_by uuid references auth.users (id);

comment on column public.erp_goods_receipts.vendor_delivery_note is
  'Phase 8.2 — מספר תעודת משלוח שהגיעה מהספק על המשאית.';
comment on column public.erp_goods_receipts.received_at is
  'Phase 8.2 — חותמת זמן הקליטה הפיזית במחסן (נכתב ע"י RPC erp_complete_goods_receipt).';
comment on column public.erp_goods_receipts.received_by is
  'Phase 8.2 — מזהה המחסנאי/קולט. נשמר auth.users.id.';

-- updated_at trigger (לא היה קיים ב-Phase 6) — מאפשר change-tracking נכון.
drop trigger if exists erp_goods_receipts_touch_updated_at_trg on public.erp_goods_receipts;
create trigger erp_goods_receipts_touch_updated_at_trg
  before update on public.erp_goods_receipts
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3) erp_goods_receipt_lines — פיצול qty + פסילה (idempotent)
-- -----------------------------------------------------------------------------
alter table public.erp_goods_receipt_lines
  add column if not exists item_id uuid references public.erp_md_items (id),
  add column if not exists rejected_qty numeric(18,3) not null default 0,
  add column if not exists reject_reason text;

-- ה-quantity הקיים = "received_qty" אפקטיבי. אנחנו לא מסירים אותו (שובר
-- תאימות עם total_price המחושב). אבל נוסיף constraint על rejected_qty.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_goods_receipt_lines_rejected_qty_nonneg'
  ) then
    alter table public.erp_goods_receipt_lines
      add constraint erp_goods_receipt_lines_rejected_qty_nonneg
        check (rejected_qty >= 0);
  end if;
end$$;

-- בקליטה החדשה (Phase 8.2), שדות ה-NOT NULL הישנים (project_id /
-- budget_sub_chapter / resource_id / unit_price) ימולאו אוטומטית מתוך
-- שורת ה-PO המקבילה ע"י API השרת. לא משנים את הסכימה.

drop trigger if exists erp_goods_receipt_lines_touch_updated_at_trg on public.erp_goods_receipt_lines;
create trigger erp_goods_receipt_lines_touch_updated_at_trg
  before update on public.erp_goods_receipt_lines
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 4) erp_purchase_order_lines.received_qty — מקור-אמת לכמות שכבר נקלטה
-- -----------------------------------------------------------------------------
alter table public.erp_purchase_order_lines
  add column if not exists received_qty numeric(18,3) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_purchase_order_lines_received_qty_nonneg'
  ) then
    alter table public.erp_purchase_order_lines
      add constraint erp_purchase_order_lines_received_qty_nonneg
        check (received_qty >= 0);
  end if;
end$$;

comment on column public.erp_purchase_order_lines.received_qty is
  'Phase 8.2 — סכום כמויות שנקלטו בפועל (rollup מ-erp_goods_receipt_lines.quantity של GR ב-status COMPLETED). מתעדכן אטומית בתוך erp_complete_goods_receipt().';

create index if not exists erp_po_lines_company_received_idx
  on public.erp_purchase_order_lines (company_id, purchase_order_id, received_qty);

-- -----------------------------------------------------------------------------
-- 5) RLS — וידוא שכבר משולב ב-user_has_company_access (היה מ-Phase 6.5,
--    מסירים את ה-policy הישן הקרוסי-tenant אם נשאר)
-- -----------------------------------------------------------------------------
alter table public.erp_goods_receipts        enable row level security;
alter table public.erp_goods_receipt_lines   enable row level security;

drop policy if exists erp_goods_receipts_all_authenticated      on public.erp_goods_receipts;
drop policy if exists erp_goods_receipt_lines_all_authenticated on public.erp_goods_receipt_lines;

drop policy if exists erp_goods_receipts_tenant_isolation      on public.erp_goods_receipts;
create policy erp_goods_receipts_tenant_isolation
  on public.erp_goods_receipts for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

drop policy if exists erp_goods_receipt_lines_tenant_isolation on public.erp_goods_receipt_lines;
create policy erp_goods_receipt_lines_tenant_isolation
  on public.erp_goods_receipt_lines for all to authenticated
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- -----------------------------------------------------------------------------
-- 6) RPC: erp_complete_goods_receipt — סגירת קליטה + rollup ל-PO
-- -----------------------------------------------------------------------------
-- ## למה RPC ולא טריגר טהור?
--   • שקיפות: ה-API קורא לפונקציה אחת ויודע בדיוק את התוצאה (newPoStatus).
--   • Idempotency: בדיקת status='DRAFT' בתחילת הפונקציה מבטיחה שלא נצבור
--     received_qty פעמיים אם הקריאה מוזרקת מחדש.
--   • Atomicity: הפונקציה רצה בעסקה אחת; אם משהו נכשל, הכל מתבטל.
--
-- ## הגדרת FULLY vs PARTIALLY
--   • FULLY_RECEIVED  — לכל שורה ב-PO, received_qty >= quantity.
--   • PARTIALLY_RECEIVED — לפחות שורה אחת receive > 0 אבל לא הכל מלא.
--   • אם אחרי הקריאה כל ה-received_qty = 0 (תרחיש קצה: כל הכמויות
--     נדחו) — לא משנים סטטוס PO; מחזירים את הסטטוס הנוכחי.
-- -----------------------------------------------------------------------------
create or replace function public.erp_complete_goods_receipt(p_gr_id uuid)
returns table (
  goods_receipt_id      uuid,
  new_gr_status         text,
  purchase_order_id     uuid,
  new_po_status         text,
  total_ordered_qty     numeric,
  total_received_qty    numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id        text;
  v_po_id             uuid;
  v_gr_status         public.erp_goods_receipt_status;
  v_total_ordered     numeric(18,3);
  v_total_received    numeric(18,3);
  v_lines_below_full  integer;
  v_new_po_status     public.erp_purchase_order_status;
  v_old_po_status     public.erp_purchase_order_status;
begin
  -- 1) שלוף GR + נעילה
  select gr.company_id, gr.purchase_order_id, gr.status
    into v_company_id, v_po_id, v_gr_status
  from public.erp_goods_receipts gr
  where gr.id = p_gr_id
  for update;

  if v_company_id is null then
    raise exception 'GR % לא נמצאה', p_gr_id using errcode = 'P0002';
  end if;

  if not public.user_has_company_access(v_company_id) then
    raise exception 'אין הרשאה לחברה % עבור GR %', v_company_id, p_gr_id
      using errcode = '42501';
  end if;

  -- 2) Idempotency — אם כבר COMPLETED, לא ליפול אבל גם לא לכפול rollup.
  if v_gr_status::text = 'COMPLETED' then
    -- מחזירים את המצב הקיים ללא שינויים.
    select status into v_new_po_status
    from public.erp_purchase_orders where id = v_po_id;

    select coalesce(sum(quantity), 0), coalesce(sum(received_qty), 0)
      into v_total_ordered, v_total_received
    from public.erp_purchase_order_lines
    where company_id = v_company_id and purchase_order_id = v_po_id;

    return query select p_gr_id, 'COMPLETED'::text, v_po_id,
                        v_new_po_status::text,
                        v_total_ordered, v_total_received;
    return;
  end if;

  if v_gr_status::text <> 'DRAFT' then
    raise exception 'לא ניתן לסגור GR % במצב %', p_gr_id, v_gr_status
      using errcode = '22023';
  end if;

  -- 3) Rollup: לכל שורת GR — הוסף quantity ל-received_qty של ה-PO line.
  --    שורות בלי purchase_order_line_id (legacy) לא ייספרו.
  update public.erp_purchase_order_lines pol
     set received_qty = pol.received_qty + grl.quantity
    from public.erp_goods_receipt_lines grl
   where grl.goods_receipt_id = p_gr_id
     and grl.purchase_order_line_id is not null
     and pol.id = grl.purchase_order_line_id
     and pol.company_id = v_company_id;

  -- 4) חישוב סטטוס PO החדש
  select coalesce(sum(quantity), 0), coalesce(sum(received_qty), 0)
    into v_total_ordered, v_total_received
  from public.erp_purchase_order_lines
  where company_id = v_company_id and purchase_order_id = v_po_id;

  select count(*) into v_lines_below_full
  from public.erp_purchase_order_lines
  where company_id = v_company_id
    and purchase_order_id = v_po_id
    and received_qty < quantity;

  select status into v_old_po_status
  from public.erp_purchase_orders where id = v_po_id;

  if v_total_received <= 0 then
    -- לא צריך לזוז סטטוס; כל הכמות נדחתה.
    v_new_po_status := v_old_po_status;
  elsif v_lines_below_full = 0 then
    v_new_po_status := 'FULLY_RECEIVED'::public.erp_purchase_order_status;
  else
    v_new_po_status := 'PARTIALLY_RECEIVED'::public.erp_purchase_order_status;
  end if;

  -- 5) עדכון GR ל-COMPLETED + audit fields
  update public.erp_goods_receipts
     set status        = 'COMPLETED'::public.erp_goods_receipt_status,
         received_at   = coalesce(received_at, now()),
         receipt_date  = coalesce(receipt_date, current_date)
   where id = p_gr_id;

  -- 6) עדכון PO סטטוס (רק אם השתנה)
  if v_new_po_status is distinct from v_old_po_status then
    update public.erp_purchase_orders
       set status = v_new_po_status
     where id = v_po_id and company_id = v_company_id;
  end if;

  return query select p_gr_id, 'COMPLETED'::text, v_po_id,
                      v_new_po_status::text,
                      v_total_ordered, v_total_received;
end;
$$;

comment on function public.erp_complete_goods_receipt(uuid) is
  'Phase 8.2 — אטומית: סוגרת GR ל-COMPLETED, מבצעת rollup של quantity ל-erp_purchase_order_lines.received_qty, ומגלגלת את erp_purchase_orders.status ל-PARTIALLY_RECEIVED/FULLY_RECEIVED לפי הצורך. Idempotent: קריאה חוזרת על GR שכבר COMPLETED מחזירה את המצב הנוכחי ולא משנה כלום.';

grant execute on function public.erp_complete_goods_receipt(uuid) to authenticated;
