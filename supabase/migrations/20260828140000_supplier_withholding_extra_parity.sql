-- Priority Parity: Extended Tax Withholding fields (screenshot 1 left column)
-- Adds fields visible in "ניכוי מס במקור" tab that were missed in migration 20260828130000

alter table public.erp_md_suppliers
  add column if not exists is_required_to_file        boolean        not null default false,
  add column if not exists withholding_from_date       date           null,
  add column if not exists withholding_to_date         date           null,
  add column if not exists max_withholding_code        varchar(20)    null,
  add column if not exists withholding_tolerance_shekel boolean       not null default false,
  add column if not exists withholding_file_code       varchar(10)    null,
  add column if not exists withholding_code_2          varchar(20)    null,
  add column if not exists withholding_code_3          varchar(20)    null;

comment on column public.erp_md_suppliers.is_required_to_file          is 'ח"ב בדווח? (Priority: TAXREQREP)';
comment on column public.erp_md_suppliers.withholding_from_date        is 'תחל מתאריך — תחילת תקופת ניכוי (Priority: WTAXFROMDATE)';
comment on column public.erp_md_suppliers.withholding_to_date          is 'עד תאריך — סוף תקופת ניכוי (Priority: WTAXTODATE)';
comment on column public.erp_md_suppliers.max_withholding_code         is 'קוד ניכוי מקסימלי (Priority: MAXWHTAXCODE)';
comment on column public.erp_md_suppliers.withholding_tolerance_shekel is 'סבלות ניכוי בסקל? (Priority: WHTAXTOLSH)';
comment on column public.erp_md_suppliers.withholding_file_code        is 'סוג ניכוי מס בקובץ מערכת 1000 (Priority: WHTAXFILECODE)';
comment on column public.erp_md_suppliers.withholding_code_2           is 'קוד ניכוי מס 2 (Priority: WHTAXCODE2)';
comment on column public.erp_md_suppliers.withholding_code_3           is 'קוד ניכוי מס 3 (Priority: WHTAXCODE3)';
