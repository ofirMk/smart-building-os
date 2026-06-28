-- Priority Parity: Supplier Financial Settings (הגדרות כספים לספקים)
-- Screenshots: חשבונאות ספק + ניכוי מס במקור + כתובת למשלוח
--
-- New fields on erp_md_suppliers:
--   Accounting: ledger_account_code, purchases_account_code, cost_center_code
--   Tax:        vat_file_number, invoice_txn_type, credit_txn_type
--   Payment:    pays_by_bank_transfer, round_invoice_price, pay_to_order_of

alter table public.erp_md_suppliers
  add column if not exists vat_file_number         text         null,
  add column if not exists pays_by_bank_transfer   boolean      not null default false,
  add column if not exists round_invoice_price     boolean      not null default false,
  add column if not exists pay_to_order_of         text         null,
  add column if not exists ledger_account_code     text         null,
  add column if not exists purchases_account_code  text         null,
  add column if not exists cost_center_code        text         null,
  add column if not exists invoice_txn_type        text         null,
  add column if not exists credit_txn_type         text         null;

comment on column public.erp_md_suppliers.vat_file_number        is 'מספר תיק במע"מ (Priority: VATNUM)';
comment on column public.erp_md_suppliers.pays_by_bank_transfer  is 'תשלום בהעברה בנקאית? (Priority: PAYBYBANK)';
comment on column public.erp_md_suppliers.round_invoice_price    is 'עיגול מחיר בחשבונית? (Priority: ROUNDPRICE)';
comment on column public.erp_md_suppliers.pay_to_order_of        is 'שלמו לפקודת — שם הנהנה לשיקים (Priority: PAYTOORDER)';
comment on column public.erp_md_suppliers.ledger_account_code    is 'חשבון לדיגי — קוד חשבון AP בספר הראשי (Priority: ACCOUNTNUM)';
comment on column public.erp_md_suppliers.purchases_account_code is 'חשבון קנות (Priority: PRCACC)';
comment on column public.erp_md_suppliers.cost_center_code       is 'פרכז רוח/עלות (Priority: COSTCENTER)';
comment on column public.erp_md_suppliers.invoice_txn_type       is 'סוג תנועה - חשבונית ספק (Priority: DOCTYPE)';
comment on column public.erp_md_suppliers.credit_txn_type        is 'סוג תנועה - זיכוי מהספק (Priority: CREDITTYPE)';
