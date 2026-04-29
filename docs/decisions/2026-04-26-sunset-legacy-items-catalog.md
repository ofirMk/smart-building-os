# החלטה: Sunset של `items_catalog` הישן — Trigger 1-Way

**תאריך**: 26.04.2026  
**סטטוס**: ❷ ממתינה לאישור (לפני Stage 4)  
**הקשר**: תוכנית הפצה ב-`docs/architecture/rollout-plan-master-data.md`

---

## הקשר

הטבלה `public.items_catalog` נוצרה ב-`20250322005000_legacy_compat_tables.sql` כשכבת תאימות לקוד ישן. אודיט מ-26.04.2026 הראה:

- ✅ **אף קוד אפליקטיבי לא קורא או כותב לטבלה הזו**.
- ⚠️ קיימים 2 FK שמצביעים אליה: `po_line_items.item_id` ו-`task_resources.item_id` (`types/supabase.ts`).
- ⚠️ הטבלה עצמה לא נוקה ולא ננטשה — היא קיימת אבל ריקה (לאמת בעת הסנט).

הקוד החדש כותב ל-`erp_md_items` בלבד. אם נשאיר את `items_catalog` בלי טיפול, אין סיכון מיידי, אבל:
1. ה-FK הישנים מצביעים על טבלה ריקה → באג עתידי בקוד שיקרא דרך JOIN.
2. עם הזמן, מודולים שטרם הומרו (אם יתגלו) ימשיכו לכתוב לישן.

## אלטרנטיבות

### A. מחיקה מיידית של הטבלה הישנה
**יתרונות**: ניקיון מלא, אפס סיכון drift.  
**חסרונות**:
- פוטנציאל לשבירת FK שלא חשבנו עליהם.
- אין דרך חזרה אם נגלה תלות לא-מתועדת.

### B. Trigger 1-Way Sync (`erp_md_items` → `items_catalog`) ✅ מומלץ
**יתרונות**:
- "חמצן" למודלים ישנים אם יתגלו — הטבלה הישנה תמיד תהיה עדכנית.
- אין שינוי קוד אפליקטיבי.
- לפני Stage 4 — נריץ ב-2 שבועות שקטים, נמדוד אם יש קוראים.
- אם יש קוראים, נדע. אם אין — נמחק את הטבלה.

**חסרונות**:
- Overhead על כתיבות (כל insert/update ל-`erp_md_items` מחיל trigger).
- צריך להגדיר mapping מדויק (סכמות שונות מאוד).

### C. השארת המצב + Logging Reads
**יתרונות**: אפס שינויים.  
**חסרונות**: לא מצביע על drift; לא נדע אם משהו עדיין קורא ממנה.

## הכרעה

**B. Trigger 1-Way + Logging תקופה של 2 שבועות → מחיקה**.

### תוכנית טכנית

#### שלב 1 — מיגרציה: trigger 1-way
```sql
-- 20260501_sunset_items_catalog_trigger.sql
create or replace function public.sync_erp_md_items_to_legacy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    insert into public.items_catalog (
      id, internal_sku, supplier_id,  -- map columns…
      description, unit, default_price, created_at
    ) values (
      new.id, new.item_number, null,
      new.description, new.unit_of_measure,
      new.default_price, new.created_at
    )
    on conflict (id) do update set
      internal_sku = excluded.internal_sku,
      description = excluded.description,
      unit = excluded.unit,
      default_price = excluded.default_price;
  end if;
  return new;
end;
$$;

create trigger erp_md_items_sync_legacy
after insert or update on public.erp_md_items
for each row execute function public.sync_erp_md_items_to_legacy();
```

#### שלב 2 — Logging תקופת המתנה
הוספת view או log table שעוקב אחר reads מ-`items_catalog` (אופציונלי, עם `pg_stat_user_tables`).

```sql
-- בדיקה ידנית פעם בשבוע:
select schemaname, relname, n_tup_ins, n_tup_upd, n_tup_del, seq_scan, idx_scan
from pg_stat_user_tables
where relname = 'items_catalog';
```

אם `seq_scan + idx_scan` נשאר 0 ל-2 שבועות → אין קוראים → מותר למחוק.

#### שלב 3 — מחיקה
```sql
-- 20260515_drop_items_catalog.sql
-- תנאי קדם: בדקנו pg_stat_user_tables = 0 reads ב-2 שבועות
alter table public.po_line_items drop constraint if exists po_line_items_item_id_fkey;
alter table public.task_resources drop constraint if exists task_resources_item_id_fkey;

drop table if exists public.items_catalog;

-- רענון types
notify pgrst, 'reload schema';
```

לאחר מכן: `npx supabase gen types typescript ...` לעדכון `types/supabase.ts`.

## תזמון

- **Stage 1+2**: לא נוגעים בטבלה (כדי לא לערב משתנים בפיילוט).
- **בין Stage 2 ל-Stage 3**: מטמיעים trigger 1-way (בטוח, לא שובר).
- **בין Stage 3 ל-Stage 4**: מודדים pg_stat ומוחקים אם נקי.

## תנאים לדחיה

הסנט יידחה אם:
1. גילינו קוד אפליקטיבי שעדיין קורא מ-`items_catalog` (ולא הומר).
2. יש לקוח ב-PROD שעדיין מסתמך על Holden ERP הישן עם data בטבלה זו.

## אישורים

- ☐ ראש פיתוח (לפני Stage 4)
- ☐ DBA (לפני המחיקה)
