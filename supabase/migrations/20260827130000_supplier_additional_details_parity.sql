-- =============================================================================
-- Supplier Card — "פרטים נוספים" Priority Parity
--
-- שדות שנחשפו בלשונית "פרטים נוספים" של Priority:
--   responsible_person  — *** לטיפול (שם אדם, לא boolean!)
--   is_foreign_supplier — ספק חול? (ספק חוץ-לארץ)
--   authorization_level — דרגת הרשאה (מינ' 0, עבור approval workflow)
--   default_order_type  — סוג הזמנה (ברירת מחדל ליצירת PO)
--   subcontractor_wh    — מחסן קבלן משנה (קוד מחסן, FK עתידי)
--   consignment_wh      — מחסן קונסיגנציה (קוד מחסן, FK עתידי)
--   supplier_type_code  — סוג ספק (קלסיפיקציה מפורטת מעבר ל-kind)
--
-- הערה: for_attention (boolean) נשמר — הוא "דגל מיידי", שונה מ-responsible_person.
-- =============================================================================

alter table public.erp_md_suppliers
  add column if not exists responsible_person   text        null,
  add column if not exists is_foreign_supplier  boolean     not null default false,
  add column if not exists authorization_level  smallint    null,
  add column if not exists default_order_type   text        null,
  add column if not exists subcontractor_wh     text        null,
  add column if not exists consignment_wh       text        null,
  add column if not exists supplier_type_code   text        null;

comment on column public.erp_md_suppliers.responsible_person   is '*** לטיפול — שם האחראי על הספק (Priority: CUSTNAME)';
comment on column public.erp_md_suppliers.is_foreign_supplier  is 'ספק חול — ספק מחו"ל (Priority: MANUALSORT)';
comment on column public.erp_md_suppliers.authorization_level  is 'דרגת הרשאה — משפיע על Approval Workflow ב-PO (Priority: AUTHORITYLEVEL)';
comment on column public.erp_md_suppliers.default_order_type   is 'סוג הזמנה ברירת מחדל (Priority: ORDERTYPE)';
comment on column public.erp_md_suppliers.subcontractor_wh     is 'מחסן קבלן משנה (Priority: WARHSNAME)';
comment on column public.erp_md_suppliers.consignment_wh       is 'מחסן קונסיגנציה (Priority: CONSIGNWHS)';
comment on column public.erp_md_suppliers.supplier_type_code   is 'סוג ספק — קלסיפיקציה מפורטת (Priority: SUPTYPE)';

-- constraint: authorization_level in range 0–9 (Priority standard)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_md_suppliers_auth_level_chk'
      and conrelid = 'public.erp_md_suppliers'::regclass
  ) then
    alter table public.erp_md_suppliers
      add constraint erp_md_suppliers_auth_level_chk
      check (authorization_level is null or authorization_level between 0 and 9);
  end if;
end $$;

-- index on responsible_person for "הספקים שלי" filter
create index if not exists erp_md_suppliers_responsible_idx
  on public.erp_md_suppliers (company_id, responsible_person)
  where responsible_person is not null;
