-- =============================================================================
-- Marker Ofek / Smart Building OS — הזמנת מנהל: Guy Rahumim
-- =============================================================================
--
-- חשוב: שורת ה-profiles חייבת להשתמש ב-UUID זהה ל-auth.users.id.
-- לכן יש ליצור את המשתמש ב-Auth לפני (או מיד אחרי) הרצת הסקריפט.
--
-- ---------------------------------------------------------------------------
-- שלב 1 — הזמנה ידנית ב-Supabase Auth (חובה)
-- ---------------------------------------------------------------------------
-- 1. היכנסו ל-Supabase Dashboard → הפרויקט שלכם.
-- 2. Authentication → Users.
-- 3. לחצו "Invite user" (או "Add user" — לפי גרסת הממשק).
-- 4. הזינו אימייל: liem.elc@gmail.com
-- 5. שלחו הזמנה. Guy יקבל מייל, יפתח קישור ויקבע סיסמה ראשונית (או ישלים
--    את תהליך ה-Magic Link — לפי מה שהגדרתם בפרויקט).
-- 6. ודאו שב-Authentication → Providers מופעל Email (ו-SMTP אם נדרש לשליחת
--    מיילים מהפרויקט).
--
-- הערה: אם קיים טריגר שיוצר profiles בשעת הרשמה, ייתכן שנוצר רשומה עם role
-- tenant. הסקריפט למטה מעדכן ל-admin ומגדיר full_name.
--
-- ---------------------------------------------------------------------------
-- שלב 2 — הרצה ב-SQL Editor (אחרי שהמשתמש קיים ב-auth.users)
-- ---------------------------------------------------------------------------
-- הריצו את הבלוק הבא ב-Supabase → SQL Editor.
-- אם המשתמש עדיין לא נרשם, השאילתה לא תוסיף שורות (אין שורת auth מתאימה).
-- הריצו שוב אחרי שההזמנה הושלמה והמשתמש מופיע תחת Authentication → Users.
-- =============================================================================

insert into public.profiles (id, full_name, role, email, is_active)
select
  u.id,
  'Guy Rahumim',
  'admin'::public.user_role,
  lower(trim(u.email)),
  true
from auth.users u
where lower(trim(u.email)) = lower(trim('liem.elc@gmail.com'))
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  email = coalesce(nullif(excluded.email, ''), public.profiles.email),
  is_active = excluded.is_active,
  updated_at = now();

-- בדיקה מהירה (אופציונלי):
-- select id, full_name, email, role from public.profiles
-- where lower(email) = lower('liem.elc@gmail.com');
