-- =============================================================================
-- Phase A.3 — Payment Terms Seed Enrichment (Priority parity)
--
-- מטרה
--   להעשיר את erp_payment_terms ב-codes נוספים שמופיעים ב-Priority's
--   payment-terms picker. *לא* לדרוס codes קיימים (01, 02, 11) — להישאר
--   תואמי לאחור עם רשומות ספקים שכבר משתמשות בהם.
--
-- Codes קיימים (מ-20260529120000)
--   01 — שוטף (EOM)
--   02 — ש15 (15 ימים, NOT EOM)   ← שונה מ-Priority's 02='90 יום'
--   11 — 30 יום (NOT EOM)
--
-- Codes שמתווספים כאן
--   03  — 15 יום
--   04  — 45 יום
--   05  — 30 יום
--   06  — 60 יום
--   07  — 120 יום
--   P02 — 90 יום (Priority's 02; שונה כי 02 קיים)
--   EOM — שוטף +0
--   E30 — שוטף + 30
--   E60 — שוטף + 60
--
-- תאימות לאחור
--   ON CONFLICT DO NOTHING — אם קוד קיים, לא נדרס.
-- =============================================================================

insert into public.erp_payment_terms
  (code, description, is_eom, months_to_add, days_to_add, installments)
values
  ('03',  '15 יום',     false, 0, 15,  1),
  ('04',  '45 יום',     false, 0, 45,  1),
  ('05',  '30 יום',     false, 0, 30,  1),
  ('06',  '60 יום',     false, 0, 60,  1),
  ('07',  '120 יום',    false, 0, 120, 1),
  ('P02', '90 יום',     false, 0, 90,  1),
  ('EOM', 'שוטף +0',    true,  0, 0,   1),
  ('E30', 'שוטף + 30',  true,  0, 30,  1),
  ('E60', 'שוטף + 60',  true,  0, 60,  1)
on conflict (code) do nothing;

comment on table public.erp_payment_terms is
  'תנאי תשלום — קוד ייחודי, שוטף/תשלומים לפי שדות CSV. '
  'Phase A הרחיבה את ה-seed עם codes נוספים מ-Priority (03–07, P02, EOM/E30/E60).';
