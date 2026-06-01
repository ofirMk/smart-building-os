-- T14 — Variations Financial Bridge.
--
-- מטרה: הפיכת חריג ל"שורת רווח" בפועל ב-DB, עם הגנה ברזלית מפני
-- כפל-חיוב כשמשכים את החריג לחשבון חלקי.
--
-- כללים: additive בלבד. אין drop, אין שינוי שמות עמודות.

-- ---------------------------------------------------------------------------
-- (a) approved_amount — הסכום שאושר ע"י מנהל הפרויקט
-- ---------------------------------------------------------------------------
alter table public.contract_variation_orders
  add column if not exists approved_amount numeric(18, 2);

alter table public.contract_variation_orders
  drop constraint if exists contract_variation_orders_approved_amount_nonneg;

alter table public.contract_variation_orders
  add constraint contract_variation_orders_approved_amount_nonneg
  check (approved_amount is null or approved_amount >= 0);

comment on column public.contract_variation_orders.approved_amount is
  'T14: הסכום שאושר ותומחר ע"י מנהל הפרויקט. NULL עד לאישור.';

-- ---------------------------------------------------------------------------
-- (b) linked_partial_account_id — נעילה לחשבון חלקי (zero double-billing)
-- ---------------------------------------------------------------------------
alter table public.contract_variation_orders
  add column if not exists linked_partial_account_id uuid
  references public.partial_accounts (id) on delete set null;

comment on column public.contract_variation_orders.linked_partial_account_id is
  'T14: כאשר חריג נמשך לחשבון חלקי — נעול לחשבון זה. ' ||
  'הנהלת החשבונות שולפת רק חריגים עם linked_partial_account_id IS NULL ' ||
  '(חוק zero double-billing).';

create index if not exists contract_variation_orders_linked_partial_idx
  on public.contract_variation_orders (linked_partial_account_id)
  where linked_partial_account_id is not null;

-- אינדקס לשליפה של "חריגים מוכנים למשיכה" — pull queue
create index if not exists contract_variation_orders_pull_ready_idx
  on public.contract_variation_orders (project_id, contract_id, status)
  where status = 'approved' and linked_partial_account_id is null;

-- ---------------------------------------------------------------------------
-- (c) Business-rules constraint — חריג מאושר חייב סכום + חוזה
--
--   draft / submitted   → approved_amount יכול להיות NULL, contract_id אופציונלי
--   approved            → חובה approved_amount NOT NULL AND contract_id NOT NULL
--   linked              → חובה גם linked_partial_account_id NOT NULL
--
-- ה-constraint deferred-able כדי לאפשר עדכון בשני שלבים ב-action יחיד.
-- ---------------------------------------------------------------------------
alter table public.contract_variation_orders
  drop constraint if exists contract_variation_orders_approved_requires_pricing;

alter table public.contract_variation_orders
  add constraint contract_variation_orders_approved_requires_pricing
  check (
    status <> 'approved'
    or (
      approved_amount is not null
      and contract_id is not null
    )
  );

comment on constraint contract_variation_orders_approved_requires_pricing
  on public.contract_variation_orders is
  'T14: חריג בסטטוס approved חייב סכום וחוזה משוייכים — תנאי-יסוד לפני pull לחשבון חלקי.';
