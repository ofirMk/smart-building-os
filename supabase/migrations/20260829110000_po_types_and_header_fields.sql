-- Priority Parity: Purchase Orders — PO Types master data + extended header fields
--
-- 1. erp_md_po_types — "סוגי הזמנת רכש" (Purchase Order Types)
-- 2. erp_purchase_orders — additional header fields visible in Priority PO form

-- ─── 1. erp_md_po_types ─────────────────────────────────────────────────────
-- הטבלה כבר קיימת מ-20260801120000_po_approval_skeleton.sql
-- עמודות קיימות: code, name_he, name_en, default_text_he, default_text_en
-- RLS כבר מופעל. ה-migration הנוכחי רק מוסיף שדות לטבלת ה-PO.

-- ─── 2. erp_purchase_orders — extended header fields ─────────────────────────
alter table public.erp_purchase_orders
  -- סוג הזמנה (FK to erp_md_po_types)
  add column if not exists po_type_code             varchar(20)  null,
  -- אופן משלוח
  add column if not exists delivery_method_code     varchar(30)  null,
  -- סניף
  add column if not exists branch_code              varchar(20)  null,
  -- עבור משתמש (free-form employee/user name, Priority: USERNM)
  add column if not exists for_user_name            varchar(100) null,
  -- דרישה מרוכזת (consolidated demand ref)
  add column if not exists centralized_demand_ref   varchar(50)  null,
  -- הצעת מחיר (quote reference)
  add column if not exists quote_ref                varchar(50)  null,
  -- הזמנת מסגרת (blanket/framework order reference)
  add column if not exists blanket_order_ref        varchar(50)  null,
  -- הזמנת לקוח (customer order reference)
  add column if not exists customer_order_ref       varchar(50)  null,
  -- קריאת שרות (service call reference)
  add column if not exists service_call_ref         varchar(50)  null,
  -- סוג תיק יבוא/יצוא (import/export file type)
  add column if not exists import_export_file_type  varchar(20)  null,
  -- תיק יבוא/יצוא (import/export file reference)
  add column if not exists import_export_file_ref   varchar(50)  null,
  -- איתור (location/tracking code)
  add column if not exists location_tracking        varchar(100) null;

comment on column public.erp_purchase_orders.po_type_code             is 'סוג הזמנה — FK ל-erp_md_po_types (Priority: TYPE)';
comment on column public.erp_purchase_orders.delivery_method_code     is 'אופן משלוח (Priority: SHIPMTHD)';
comment on column public.erp_purchase_orders.branch_code              is 'סניף (Priority: BRANCHNAME)';
comment on column public.erp_purchase_orders.for_user_name            is 'עבור משתמש — שם המשתמש/העובד שהזמין (Priority: USERNM)';
comment on column public.erp_purchase_orders.centralized_demand_ref   is 'דרישה מרוכזת — מספר דרישה (Priority: ORDERINT)';
comment on column public.erp_purchase_orders.quote_ref                is 'הצעת מחיר — מספר הצעה (Priority: QNUM)';
comment on column public.erp_purchase_orders.blanket_order_ref        is 'הזמנת מסגרת — מספר הזמנת מסגרת (Priority: BLANKETORD)';
comment on column public.erp_purchase_orders.customer_order_ref       is 'הזמנת לקוח — מספר הזמנת לקוח (Priority: CUST_ORDNUM)';
comment on column public.erp_purchase_orders.service_call_ref         is 'קריאת שרות — מספר קריאה (Priority: CALLNUM)';
comment on column public.erp_purchase_orders.import_export_file_type  is 'סוג תיק יבוא/יצוא (Priority: CUSTDOC)';
comment on column public.erp_purchase_orders.import_export_file_ref   is 'תיק יבוא/יצוא — מספר תיק (Priority: CUSTDOCNUM)';
comment on column public.erp_purchase_orders.location_tracking        is 'איתור — קוד מעקב/מיקום (Priority: TRACKNUM)';
