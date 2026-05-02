-- =============================================================================
-- Phase 8.1.1 — PO Number Sequences (SOX-Compliant Official Numbering)
-- =============================================================================
-- מטרה
--   לספק מספור רצוף, אטומי, ובלתי־הפיך להזמנות רכש ברגע שהן חורגות מ-"טיוטה"
--   ומגיעות לסטטוס APPROVED. זה דרישה רגולטורית (SOX / ת"ן 15011) — לא יכול
--   להיות "חור" ברצף המספרים, ולא יכולות להיות שתי הזמנות עם אותו מספר רשמי.
--
-- ארכיטקטורה
--   • `po_number` הקיים (text, not null, unique) נשאר המזהה הפנימי/טיוטה.
--     נכתב בעת יצירה ("DRAFT-2026-0001" או מה שה-UI שולח). שומר תאימות לאחור.
--   • `official_po_number` (חדש, nullable) מוקצה *רק* כש-status עובר ל-APPROVED,
--     ופעם אחת בלבד — הטריגר ידאג שלא יידרס שוב גם אם סטטוס יירד וישוב.
--   • `erp_po_number_sequences(company_id PK, prefix, current_value)` — שומר
--     counter פר-חברה.
--   • RPC `erp_get_next_po_number(p_company_id text)` — increment אטומי עם
--     UPDATE..RETURNING (מצרך אטומי ב-Postgres, מחזיק ROW LOCK עד COMMIT).
--     Upsert פנימי: אם החברה עדיין לא קיימת בטבלת ה-sequences, יוצר עם 0.
--   • Trigger AFTER UPDATE על `erp_purchase_orders` — טוחן את ה-RPC כאשר
--     status עובר ל-APPROVED ו-official_po_number עדיין null. לא נוגע
--     ב-erp_decide_approval הקיים (defense in depth: כל path שמעדכן
--     ל-APPROVED — כולל erp_submit_po_for_approval auto-approve path וכל
--     עדכון עתידי — יקבל אוטומטית מספר).
--
-- חוזה תאימות
--   • אדיטיבי לחלוטין. שום column/function קיים לא נוגע.
--   • הזמנות קיימות ב-APPROVED *לא* יקבלו מספור רטרואקטיבית — זה מכוון
--     (לא רוצים לחרוג מ-sequence ללא שליטה מנהלית). ניתן לבצע זאת ידנית
--     ע"י UPDATE ... SET status = status (no-op) שיפעיל את הטריגר.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Sequences table
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.erp_po_number_sequences (
  company_id    text        primary key
                             references public.erp_companies (id) on delete cascade,
  prefix        varchar(16) not null default 'PO-',
  current_value bigint      not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint erp_po_number_sequences_prefix_nonempty
    check (length(trim(prefix)) > 0),
  constraint erp_po_number_sequences_nonneg
    check (current_value >= 0)
);

comment on table public.erp_po_number_sequences is
  'Phase 8.1.1 — מונה מספור רשמי להזמנות רכש פר-חברה. מקור האמת היחיד לשדה erp_purchase_orders.official_po_number.';

-- RLS
alter table public.erp_po_number_sequences enable row level security;

drop policy if exists erp_po_number_sequences_tenant_isolation on public.erp_po_number_sequences;
create policy erp_po_number_sequences_tenant_isolation
  on public.erp_po_number_sequences
  for all
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));

-- touch updated_at
drop trigger if exists erp_po_number_sequences_touch_updated_at_trg on public.erp_po_number_sequences;
create trigger erp_po_number_sequences_touch_updated_at_trg
  before update on public.erp_po_number_sequences
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) official_po_number column on erp_purchase_orders
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.erp_purchase_orders
  add column if not exists official_po_number text;

comment on column public.erp_purchase_orders.official_po_number is
  'Phase 8.1.1 — מספר הזמנה רשמי (SOX). מוקצה ע"י הטריגר erp_po_assign_official_number_trg ברגע שהסטטוס עובר ל-APPROVED. לעולם לא נדרס (immutable SOX).';

-- ייחודיות ברמת חברה על מספרים רשמיים (partial — מתעלם מטיוטות שעדיין null).
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'erp_purchase_orders_official_po_number_uq'
  ) then
    create unique index erp_purchase_orders_official_po_number_uq
      on public.erp_purchase_orders (company_id, official_po_number)
      where official_po_number is not null;
  end if;
end$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) RPC — erp_get_next_po_number
-- ─────────────────────────────────────────────────────────────────────────────
-- אטומיות: UPDATE..RETURNING ב-Postgres מחזיק ROW LOCK אקסקלוסיבי עד סוף
-- הטרנזקציה. שני concurrent callers יעבדו *בסדר*, לא במקביל, וכל אחד יקבל
-- מספר עוקב. אין race condition אפילו תחת עומס.
--
-- security definer: כדי שהטריגר (שרץ בהקשר של כל update) יצליח להגדיל את
-- ה-counter גם אם למשתמש אין הרשאת כתיבה ישירה ל-erp_po_number_sequences
-- (חשוב: approver יכול לאשר PO אבל לא בהכרח צריך לגעת בטבלת sequences).
-- אבטחה: בתוך הפונקציה בודקים user_has_company_access ל-p_company_id.
create or replace function public.erp_get_next_po_number(
  p_company_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix  varchar(16);
  v_next    bigint;
begin
  if p_company_id is null or length(trim(p_company_id)) = 0 then
    raise exception 'p_company_id is required.' using errcode = '22023';
  end if;

  -- אבטחה: למרות security definer, חייב לוודא שהקורא באמת שייך לחברה.
  -- אם זה נקרא מתוך trigger בהקשר של erp_purchase_orders, ה-RLS של ה-PO
  -- כבר הגביל אותו. אבל אם נקרא ישירות (למשל מ-API) — נצטרך לבדוק כאן.
  if not public.user_has_company_access(p_company_id) then
    raise exception 'access denied to company %.', p_company_id using errcode = '42501';
  end if;

  -- Upsert: אם אין עוד row לחברה הזאת — יוצרים עם current_value=1 ומחזירים.
  -- אם יש — מעלים ב-1 ומחזירים את הערך החדש.
  insert into public.erp_po_number_sequences (company_id, current_value)
  values (p_company_id, 1)
  on conflict (company_id) do update
    set current_value = public.erp_po_number_sequences.current_value + 1,
        updated_at = now()
  returning prefix, current_value into v_prefix, v_next;

  -- פורמט: PREFIX + 5 ספרות padded (PO-00001, PO-12345, PO-99999).
  -- עם >99999 נעבור ל-6 ספרות אוטומטית בעזרת lpad min-width.
  return v_prefix || lpad(v_next::text, 5, '0');
end;
$$;

comment on function public.erp_get_next_po_number(text) is
  'Phase 8.1.1 — מחזיר מספר הזמנה רשמי עוקב פר-חברה (אטומי, SOX-safe). פורמט: PREFIX + 5 ספרות padded. Upsert של sequence row בלחיצה ראשונה.';

-- grants — הטריגר רץ במשתמש של המעדכן, אז authenticated חייב שיהיה לו EXECUTE.
grant execute on function public.erp_get_next_po_number(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Trigger — assign official number on APPROVED transition
-- ─────────────────────────────────────────────────────────────────────────────
-- מדוע AFTER ולא BEFORE:
--   BEFORE יאפשר שינוי ה-NEW בתוך הטריגר (יעיל יותר) אבל ה-UPDATE על
--   erp_po_number_sequences שקורה בתוך הטריגר עצמו הופך את זה ל-complex.
--   AFTER פשוט יותר: העדכון של הסטטוס כבר commit-ready, עכשיו מריצים
--   UPDATE נוסף על אותה שורה לקבוע את official_po_number. אטומי ב-transaction.
create or replace function public.erp_po_assign_official_number_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number text;
begin
  -- שומר על טריגר זה idempotent: רץ רק במעבר status → APPROVED וכשאין כבר מספר.
  if (tg_op = 'UPDATE'
      and new.status = 'APPROVED'::public.erp_purchase_order_status
      and (old.status is distinct from new.status or new.official_po_number is null)
      and new.official_po_number is null)
  then
    v_number := public.erp_get_next_po_number(new.company_id);
    update public.erp_purchase_orders
       set official_po_number = v_number
     where id = new.id;
  end if;
  return new;
end;
$$;

comment on function public.erp_po_assign_official_number_fn() is
  'Phase 8.1.1 — trigger function: מקצה official_po_number ברגע שהזמנה עוברת ל-APPROVED, ואם עדיין לא קיים (idempotent, SOX: לעולם לא נדרס).';

drop trigger if exists erp_po_assign_official_number_trg on public.erp_purchase_orders;
create trigger erp_po_assign_official_number_trg
  after update of status on public.erp_purchase_orders
  for each row
  when (new.status = 'APPROVED'::public.erp_purchase_order_status
        and new.official_po_number is null)
  execute function public.erp_po_assign_official_number_fn();

comment on trigger erp_po_assign_official_number_trg on public.erp_purchase_orders is
  'Phase 8.1.1 — מפעיל את ההקצאה האטומית. WHEN clause מסנן לפני ביצוע בכלל (זול יותר מבדיקה בתוך הפונקציה).';
