-- PO שנוצר ממכרז (BoQ): קישור ל־tenders ללא חובת project_id
-- הרץ אחרי marker_ofek_procurement.sql + tender intake

alter table public.purchase_orders
  add column if not exists tender_id uuid references public.tenders (id) on delete set null;

alter table public.purchase_orders
  alter column project_id drop not null;

alter table public.purchase_orders
  drop constraint if exists purchase_orders_project_or_tender_chk;

alter table public.purchase_orders
  add constraint purchase_orders_project_or_tender_chk
  check (project_id is not null or tender_id is not null);

comment on column public.purchase_orders.tender_id is
  'מכרז מקור (קדם ביצוע) כשההזמנה נוצרה מכתב כמויות; project_id יכול להיות null';
