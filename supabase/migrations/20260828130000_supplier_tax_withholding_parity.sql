-- Priority Parity: Supplier Tax Withholding + General Details
-- Screenshots: ניכוי מס במקור + פרטים כלליים
--
-- Fields added to erp_md_suppliers:
--   General:    vat_code, is_internal_supplier, general_discount_pct
--   Tax:        income_tax_file_number, income_tax_file_type,
--               withholding_pct, withholding_valid_until,
--               max_withholding_pct, bookkeeping_cert_valid_until,
--               withholding_discount, withholding_discount_until,
--               withholds_from_supplier, income_tax_classification,
--               tax_officer_code

alter table public.erp_md_suppliers
  -- פרטים כלליים
  add column if not exists vat_code                    varchar(10)    null,
  add column if not exists is_internal_supplier        boolean        not null default false,
  add column if not exists general_discount_pct        numeric(8,4)   null,
  -- ניכוי מס במקור
  add column if not exists income_tax_file_number      varchar(50)    null,
  add column if not exists income_tax_file_type        smallint       null,
  add column if not exists withholding_pct             numeric(8,4)   null,
  add column if not exists withholding_valid_until     date           null,
  add column if not exists max_withholding_pct         numeric(8,4)   null,
  add column if not exists bookkeeping_cert_valid_until date          null,
  add column if not exists withholding_discount        numeric(8,4)   null,
  add column if not exists withholding_discount_until  date           null,
  add column if not exists withholds_from_supplier     boolean        not null default false,
  add column if not exists income_tax_classification   varchar(20)    null,
  add column if not exists tax_officer_code            varchar(10)    null;

comment on column public.erp_md_suppliers.vat_code                     is 'קוד מע"מ (Priority: VATCODE — 002=מלא)';
comment on column public.erp_md_suppliers.is_internal_supplier         is 'ספק פנימי? (Priority: INTERN)';
comment on column public.erp_md_suppliers.general_discount_pct         is 'הנחה כללית % (Priority: GENDISCOUNT)';
comment on column public.erp_md_suppliers.income_tax_file_number       is 'מס.זהות/תיק מס הכנסה (Priority: TAXID)';
comment on column public.erp_md_suppliers.income_tax_file_type         is 'הסבר על מספר התיק: 1=עצמאי/ת.ז, 2=חברה, 3=עוסק מורשה, 5=בינלאומי, 9=תושב חוץ';
comment on column public.erp_md_suppliers.withholding_pct              is '% ניכי מס (Priority: WHTAXPCT)';
comment on column public.erp_md_suppliers.withholding_valid_until      is 'בתוקף עד (Priority: WHTAXEXPIRE)';
comment on column public.erp_md_suppliers.max_withholding_pct          is '% ניכי מקסימלי (Priority: MAXWHTAXPCT)';
comment on column public.erp_md_suppliers.bookkeeping_cert_valid_until is 'אישור ספרים עד (Priority: BOOKCERTEXPIRE)';
comment on column public.erp_md_suppliers.withholding_discount         is 'הנחה על ניכי מס (Priority: WHTAXDISCOUNT)';
comment on column public.erp_md_suppliers.withholding_discount_until   is 'הנחה בתוקף עד (Priority: WHTAXDISCOUNTEXPIRE)';
comment on column public.erp_md_suppliers.withholds_from_supplier      is 'ניכי מס ממקור מספקים (Priority: WITHHOLD)';
comment on column public.erp_md_suppliers.income_tax_classification    is 'דיהי למס הכנסה — קוד סיווג (Priority: TAXCLASSIFY)';
comment on column public.erp_md_suppliers.tax_officer_code             is 'קוד פקיד שומה (Priority: TAXOFFICER)';
