-- T13 — Variations UI prerequisites:
--   (a) storage bucket שה-ai-worker מעלה אליו את ה-booklet
--   (b) הרפיית NOT NULL מ-contract_id (חריגים מהשטח לא תמיד קשורים לחוזה)
--   (c) public read policy על אובייקטים בבאקט — כדי שה-Frontend יציג את ה-PDF
--
-- כללי: additive בלבד. אין שינוי נתונים קיימים, אין drop.

-- ---------------------------------------------------------------------------
-- (a) Storage bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('variation-booklets', 'variation-booklets', true)
on conflict (id) do update set public = excluded.public;

-- כתיבה רק ל-service_role (ה-ai-worker). אנונימי יכול לקרוא דרך public URL.
drop policy if exists variation_booklets_service_write on storage.objects;
create policy variation_booklets_service_write
  on storage.objects for all
  to service_role
  using (bucket_id = 'variation-booklets')
  with check (bucket_id = 'variation-booklets');

drop policy if exists variation_booklets_anon_read on storage.objects;
create policy variation_booklets_anon_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'variation-booklets');

-- ---------------------------------------------------------------------------
-- (b) Relax contract_id NOT NULL — חריג מהשטח יכול להיווצר כ-draft
--     לפני שמחליטים לאיזה חוזה לקשור אותו. אם בעתיד נחבר חוזה,
--     ה-FK נשמר (on delete cascade ממשיך לעבוד).
-- ---------------------------------------------------------------------------
alter table public.contract_variation_orders
  alter column contract_id drop not null;

comment on column public.contract_variation_orders.contract_id is
  'אופציונלי (relaxed ב-T13). חריגי-שטח נוצרים כ-draft לפני שיוך לחוזה.';

-- ה-unique (contract_id, vo_number) ממשיך לעבוד — בפוסטגרס שתי
-- שורות עם contract_id IS NULL לא מתנגשות ב-unique. עדיין, כדי
-- למנוע התנגשויות בין חריגי-שטח של אותו פרויקט, נוסיף partial
-- unique על (project_id, vo_number) — רק כשאין contract_id.
create unique index if not exists contract_variation_orders_project_vo_uq
  on public.contract_variation_orders (project_id, vo_number)
  where contract_id is null and project_id is not null;
