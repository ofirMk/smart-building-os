-- Priority Parity #5: מחירוני ספק — שדות יצרן + זמן אספקה
-- צילום #5: טאב "מחירוני לספק" חושף עמודות: שם יצרן, שם מלא יצרן, זמן אספקה בי'

alter table public.erp_md_supplier_items
  add column if not exists manufacturer_sku        text null,
  add column if not exists manufacturer_name       text null,
  add column if not exists manufacturer_full_name  text null,
  add column if not exists lead_time_days          integer null
    constraint erp_md_supplier_items_lead_time_nonneg check (lead_time_days is null or lead_time_days >= 0);

comment on column public.erp_md_supplier_items.manufacturer_sku       is 'מק"ט יצרן/צרן';
comment on column public.erp_md_supplier_items.manufacturer_name      is 'שם יצרן';
comment on column public.erp_md_supplier_items.manufacturer_full_name is 'שם מלא יצרן';
comment on column public.erp_md_supplier_items.lead_time_days         is 'זמן אספקה בימים (lead time)';

-- אינדקס לחיפוש לפי יצרן
create index if not exists erp_md_supplier_items_manufacturer_idx
  on public.erp_md_supplier_items(company_id, manufacturer_name)
  where manufacturer_name is not null;
