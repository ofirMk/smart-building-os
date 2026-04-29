-- ─────────────────────────────────────────────────────────────────────────
-- UOM (units_of_measure) — היברידי: גלובלי + תלוי-חברה
-- ─────────────────────────────────────────────────────────────────────────
--
-- מטרה: לאפשר F2 Drill-Down ליצירת UOM חדשים מתוך טופס פריט,
-- בלי לפגוע ב-13 ה-UOMs הגלובליים שכבר seeded.
--
-- מודל:
--   • `company_id IS NULL` → UOM גלובלי (זמין לכל החברות).
--   • `company_id = X` → UOM ספציפי לחברה X בלבד.
--
-- שאילתת קריאה תקנית:
--   WHERE company_id IS NULL OR company_id = active_company
--   (יש לוודא בקוד דה-דופ לפי `code`, מעדיפים את הספציפי לחברה.)
--
-- אילוצים:
--   • Code ייחודי בתוך הסקופ — שני partial unique indexes.
--   • Code אחיד למקרה (UPPERCASE).
--
-- אבטחה:
--   • RLS — קריאה: כל מאומת רואה גלובליים + UOMs של החברה הפעילה שלו.
--           כתיבה: רק עם company_id התואם לחברות בהן יש ל-user
--                  membership פעיל ב-erp_user_company_memberships.
--                  גלובליים — רק admin (לא מטופל כאן; עדיין ב-service_role bypass).
-- ─────────────────────────────────────────────────────────────────────────

-- 1. הוספת עמודה company_id (nullable — שומר על תאימות לאחור עם 13 הגלובליים)
alter table public.units_of_measure
  add column if not exists company_id text null
    references public.erp_companies (id) on delete cascade;

comment on column public.units_of_measure.company_id is
  'NULL = UOM גלובלי, זמין לכל החברות. ערך = UOM ספציפי לחברה זו בלבד.';

-- 2. הסרת constraint UNIQUE הישן על code (היה גלובלי בלבד — סותר את המודל החדש)
alter table public.units_of_measure
  drop constraint if exists uom_code_unique;

-- 3. שני partial unique indexes — בידוד מלא בין סקופים
create unique index if not exists uom_code_global_unique_idx
  on public.units_of_measure (code)
  where company_id is null;

create unique index if not exists uom_code_company_unique_idx
  on public.units_of_measure (company_id, code)
  where company_id is not null;

-- 4. אינדקס תפעולי לחיפוש לפי חברה
create index if not exists uom_company_id_idx
  on public.units_of_measure (company_id)
  where company_id is not null;

-- 5. RLS — ציבורי הגלובליים + תלוי-חברה הפרטיים
drop policy if exists uom_all_authenticated on public.units_of_measure;

create policy uom_select_global_or_member on public.units_of_measure
  for select
  to authenticated
  using (
    company_id is null
    or exists (
      select 1
      from public.erp_user_company_memberships m
      where m.user_id = auth.uid()
        and m.company_id = units_of_measure.company_id
        and m.is_active = true
    )
  );

create policy uom_insert_member on public.units_of_measure
  for insert
  to authenticated
  with check (
    company_id is not null
    and exists (
      select 1
      from public.erp_user_company_memberships m
      where m.user_id = auth.uid()
        and m.company_id = units_of_measure.company_id
        and m.is_active = true
    )
  );

create policy uom_update_member on public.units_of_measure
  for update
  to authenticated
  using (
    company_id is not null
    and exists (
      select 1
      from public.erp_user_company_memberships m
      where m.user_id = auth.uid()
        and m.company_id = units_of_measure.company_id
        and m.is_active = true
    )
  )
  with check (
    company_id is not null
    and exists (
      select 1
      from public.erp_user_company_memberships m
      where m.user_id = auth.uid()
        and m.company_id = units_of_measure.company_id
        and m.is_active = true
    )
  );

create policy uom_delete_member on public.units_of_measure
  for delete
  to authenticated
  using (
    company_id is not null
    and exists (
      select 1
      from public.erp_user_company_memberships m
      where m.user_id = auth.uid()
        and m.company_id = units_of_measure.company_id
        and m.is_active = true
    )
  );

-- הערה: שירותי service_role עוקפים RLS לחלוטין — תקין לעבודות מערכת,
-- מיגרציות, וקרון. ה-API שלנו `requireMasterDataApiContext` משתמש ב-service_role
-- רק במסלול cron, לכן זה בטוח.
