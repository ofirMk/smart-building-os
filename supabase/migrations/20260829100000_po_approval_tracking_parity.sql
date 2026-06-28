-- Priority Parity: Purchase Order "אישורים ומעקב ביצוע" tab fields
--
-- New columns on erp_purchase_orders:
--   is_printed                — הדפסה
--   is_unlocked_for_changes   — ניתוק לשינוי?
--   is_partially_closed       — סגרה חלקית
--   is_purchasing_only        — לקנין בלבד?
--   supplier_auth_level_override — דרגת הרשאה לספק
--   approvers_list_code       — רשימת מאשרים (קוד)

alter table public.erp_purchase_orders
  add column if not exists is_printed                  boolean    not null default false,
  add column if not exists is_unlocked_for_changes     boolean    not null default false,
  add column if not exists is_partially_closed         boolean    not null default false,
  add column if not exists is_purchasing_only          boolean    not null default false,
  add column if not exists supplier_auth_level_override smallint  null,
  add column if not exists approvers_list_code         varchar(30) null;

comment on column public.erp_purchase_orders.is_printed                  is 'הדפסה — האם ה-PO הודפס (Priority: PRINTED)';
comment on column public.erp_purchase_orders.is_unlocked_for_changes     is 'ניתוק לשינוי? — מאפשר עריכה לאחר אישור (Priority: UNLOCKFORCHANGE)';
comment on column public.erp_purchase_orders.is_partially_closed         is 'סגרה חלקית — חלק מהשורות נסגרו (Priority: PARTCLOSE)';
comment on column public.erp_purchase_orders.is_purchasing_only          is 'לקנין בלבד? — הגבלת PO לרכש בלבד (Priority: FORPURCHONLY)';
comment on column public.erp_purchase_orders.supplier_auth_level_override is 'דרגת הרשאה לספק — עוקף את ברירת המחדל של הספק לצורך PO זה (Priority: AUTHORITYLEVEL)';
comment on column public.erp_purchase_orders.approvers_list_code         is 'רשימת מאשרים — קוד רשימת האישורים (Priority: APPROVLIST)';
