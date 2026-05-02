-- =============================================================================
-- Phase 8.1.4 — PO Sent-to-Supplier: status value + audit log
-- =============================================================================
-- מטרה
--   לסגור את מעגל "הזמנה רשמית שיצאה החוצה": להוסיף סטטוס
--   SENT_TO_SUPPLIER ל-enum של ה-PO, ולהקים טבלת אודיט שמתעדת מי שלח, מתי,
--   לאיזו כתובת, והאם הצליח.
--
-- אדיטיבי לחלוטין — לא משנה ערכים קיימים ולא מסיר את 'SENT' ההיסטורי.
-- שימו לב: 'SENT' (ערך קיים מ-2026-06-27) ו-'SENT_TO_SUPPLIER' (הערך החדש)
-- הם *שני* ערכים שמשקפים אותה כוונה. הקוד ב-8.1.4 ישתמש רק ב-SENT_TO_SUPPLIER;
-- ה-SENT הישן יישאר רק ל-backward compatibility של טבלאות PO legacy.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) הרחבת enum erp_purchase_order_status ב-'SENT_TO_SUPPLIER'
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_type where typname = 'erp_purchase_order_status') then
    alter type public.erp_purchase_order_status
      add value if not exists 'SENT_TO_SUPPLIER' after 'APPROVED';
  end if;
end$$;

-- -----------------------------------------------------------------------------
-- 2) erp_po_sent_log — audit trail לכל שליחה לספק
-- -----------------------------------------------------------------------------
create table if not exists public.erp_po_sent_log (
  id                 uuid primary key default gen_random_uuid(),
  company_id         text not null
                       references public.erp_companies (id) on delete cascade,
  purchase_order_id  uuid not null
                       references public.erp_purchase_orders (id) on delete cascade,
  sent_by            uuid references auth.users (id),
  sent_at            timestamptz not null default now(),
  recipient_email    text not null,
  note               text,
  /** תוצאת השליחה: SUCCESS (נשלח בפועל ע"י ספק המייל), MOCK (dev / אין API key),
      FAILED (ניסיון כשל). */
  delivery_status    text not null default 'SUCCESS'
                       check (delivery_status in ('SUCCESS','MOCK','FAILED')),
  /** תיאור מפורט של הכשל או מזהה ההודעה מספק המייל. */
  provider_message   text,
  created_at         timestamptz not null default now(),
  constraint erp_po_sent_log_recipient_nonempty
    check (length(trim(recipient_email)) > 0)
);

comment on table public.erp_po_sent_log is
  'Phase 8.1.4 — אודיט לכל שליחת PO לספק (מי, מתי, לאן, ומה התוצאה).';
comment on column public.erp_po_sent_log.delivery_status is
  'SUCCESS = נשלח ע"י Resend/Postmark. MOCK = אין תצורת מייל, הודפס ל-console. FAILED = ניסיון כשל.';

-- indexes — רוב השאילתות יהיו "מי שלח לאחרונה את PO X" ו-"מה היסטוריית החברה".
create index if not exists erp_po_sent_log_po_id_sent_at_idx
  on public.erp_po_sent_log (purchase_order_id, sent_at desc);
create index if not exists erp_po_sent_log_company_sent_at_idx
  on public.erp_po_sent_log (company_id, sent_at desc);

-- RLS
alter table public.erp_po_sent_log enable row level security;

drop policy if exists erp_po_sent_log_tenant_isolation on public.erp_po_sent_log;
create policy erp_po_sent_log_tenant_isolation
  on public.erp_po_sent_log
  for all
  using (public.user_has_company_access(company_id))
  with check (public.user_has_company_access(company_id));
