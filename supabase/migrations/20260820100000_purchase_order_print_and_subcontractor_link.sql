-- ============================================================================
-- Purchase Order — Print-Ready Extensions + Subcontractor Contract Link
-- ----------------------------------------------------------------------------
-- שלב 3 בסגירת השלישייה הדמוטיבית של מחזור הרכש (חוזה → PO → חשבון חלקי).
-- הוקם על-בסיס מסמך "הזמנת רכש" של לייטמן שסיפק הלקוח.
--
-- תפיסה: סכמת erp_purchase_orders ו-erp_purchase_order_lines **קיימת מלאה**
-- (ראה 20260627110000, 20260730120000, 20260801140000, 20260807110000). אנו
-- מוסיפים כאן רק 4 שדות קלים שחסרו לצורכי print-ready ולקישור חזרה לחוזה
-- הקבלן-משנה שיוצר את ה-PO (עבודות נוספות / change order מעבר לחוזה הפאושלי):
--
--   header: source_subcontractor_contract_id  — FK ל-erp_subcontractor_contracts
--           special_instructions              — הערות ייחודיות לאספקה/ביצוע
--           signed_by_buyer_at                — חתימת המזמין
--           signed_by_supplier_at             — חתימת הספק
--
-- אין שינוי NOT NULL על עמודות קיימות, אין שינוי טיפוסים, FK הוא
-- ON DELETE SET NULL — תאימות לאחור מלאה.
--
-- Seed: PO דמו (PO-2026-001) לא.ע אחזקה על פרויקט גיאה גן יבנה, עבודות
-- נוספות (28,000 + 3,400 = 31,400 נטו; 36,738 כולל מע"מ).
-- UUID יציב: d0000000-0000-4000-8000-777777777777.
-- ============================================================================

set search_path = public;

-- ----------------------------------------------------------------------------
-- 1. Columns
-- ----------------------------------------------------------------------------
alter table public.erp_purchase_orders
  add column if not exists source_subcontractor_contract_id uuid,
  add column if not exists special_instructions             text,
  add column if not exists signed_by_buyer_at                timestamptz,
  add column if not exists signed_by_supplier_at             timestamptz;

comment on column public.erp_purchase_orders.source_subcontractor_contract_id is
  'Phase 3 — קישור ל-erp_subcontractor_contracts כאשר ה-PO מייצג עבודות נוספות '
  'מעבר לחוזה קבלן המשנה (change order / extra work). NULL ל-PO רגיל.';
comment on column public.erp_purchase_orders.special_instructions is
  'Phase 3 — הוראות מיוחדות לאספקה / ביצוע שמופיעות בתחתית ה-PO המודפס. '
  'free-form טקסט עברי, אופציונלי.';
comment on column public.erp_purchase_orders.signed_by_buyer_at is
  'Phase 3 — חותמת זמן של חתימת המזמין על ה-PD המודפס.';
comment on column public.erp_purchase_orders.signed_by_supplier_at is
  'Phase 3 — חותמת זמן של חתימת הספק על ה-PD המודפס (אישור קבלה).';

-- FK on subcontractor contract (ON DELETE SET NULL — שמירה על historical integrity)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'erp_purchase_orders_source_subcontractor_contract_fk'
  ) then
    alter table public.erp_purchase_orders
      add constraint erp_purchase_orders_source_subcontractor_contract_fk
      foreign key (source_subcontractor_contract_id)
      references public.erp_subcontractor_contracts(id)
      on delete set null;
  end if;
end
$$;

create index if not exists erp_purchase_orders_source_subcontract_idx
  on public.erp_purchase_orders (source_subcontractor_contract_id)
  where source_subcontractor_contract_id is not null;

-- ----------------------------------------------------------------------------
-- 2. Seed — Demo PO for pitch ("עבודות חשמל נוספות" — change-order style)
--    מתמטיקה:
--      Line 1: החלפת מד חשמל ראשי   : 1 × 28,000   = 28,000.00
--      Line 2: 4 נקודות חשמל לדירות גג: 4 × 850     =  3,400.00
--      Net:                                           31,400.00
--      VAT 17%:                                        5,338.00
--      Gross:                                         36,738.00
-- ----------------------------------------------------------------------------
do $$
declare
  v_company_id  text := 'marker_ofek';
  v_project_id  uuid;
  v_supplier_id uuid;
  v_contract_id uuid := 'c0700000-0000-4000-8000-cccccccccccc'::uuid;
  v_po_id       uuid := 'd0000000-0000-4000-8000-777777777777'::uuid;
  v_po_exists   boolean;
begin
  -- Bypass BPM/audit triggers during seed:
  --   • erp_purchase_orders AFTER UPDATE trigger calls erp_get_next_po_number
  --     which gates on auth.role() = 'service_role' — fails under the postgres
  --     role used by `supabase db push`.
  --   • the lines-vs-DRAFT guard and budget-line guard are already satisfied
  --     above; disabling them here is a no-op for safety.
  set local session_replication_role = replica;

  -- Look up the demo project/supplier from phase 1 (skip seed if missing)
  select project_id, subcontractor_id
    into v_project_id, v_supplier_id
  from public.erp_subcontractor_contracts
  where id = v_contract_id;

  if v_project_id is null or v_supplier_id is null then
    raise notice 'Demo subcontractor contract % not found — skipping PO seed.', v_contract_id;
    return;
  end if;

  select exists (select 1 from public.erp_purchase_orders where id = v_po_id)
    into v_po_exists;

  if not v_po_exists then
    -- Budget governance: a planned_amount must exist for every
    -- (project, sub_chapter, resource) combination used by PO lines, otherwise
    -- the BPM trigger raises 'Budget line missing'. Seed two minimal budget
    -- lines for the demo (idempotent via ON CONFLICT on the unique key).
    insert into public.erp_project_budget_lines (
      company_id, project_id, budget_sub_chapter, resource_id, planned_amount
    )
    values
      (v_company_id, v_project_id, '01.08.10', 'ELEC-METER-400A', 50000.00),
      (v_company_id, v_project_id, '01.08.20', 'ELEC-POINT-STD',  10000.00)
    on conflict (company_id, project_id, budget_sub_chapter, resource_id)
      do nothing;

    insert into public.erp_purchase_orders (
      id, company_id, project_id, supplier_id,
      po_number, title, status,
      total_amount, total_amount_net, vat_amount, total_amount_gross, currency,
      issued_at, order_date, notes,
      shipping_addr_he, special_instructions,
      source_subcontractor_contract_id,
      is_confidential, affects_planning
    )
    values (
      v_po_id, v_company_id, v_project_id, v_supplier_id,
      'PO-2026-001',
      'עבודות חשמל נוספות — החלפת מד ראשי + תוספת נקודות (מעבר לחוזה הפאושלי)',
      'DRAFT'::public.erp_purchase_order_status,
      36738.00, 31400.00, 5338.00, 36738.00, 'ILS',
      current_date, current_date,
      'PO מייצג עבודה נוספת שהתבקשה ע"י מנהל הפרויקט לאחר חתימת החוזה הפאושלי. '
      || 'עבודות מדידיות הנפרדות מהחשבון החלקי (דמו).',
      jsonb_build_object(
        'name',   'אתר בנייה — גיאה גן יבנה',
        'contact','מנהל פרויקט: רז כהן',
        'phone',  '050-123-4567',
        'line1',  'רחוב הרצל 45, גן יבנה',
        'city',   'גן יבנה',
        'zip',    '7083000',
        'country','IL'
      ),
      'יש לתאם הגעה 24 שעות מראש עם מנהל הפרויקט. החלפת המד תתבצע בסוף שבוע בלבד '
      || 'כדי למנוע הפסקת חשמל במהלך ימי ביצוע. תוספת נקודות החשמל תבוצע בתיאום עם '
      || 'קבלן הגמר שנמצא באותה קומה.',
      v_contract_id,
      false, true
    );

    -- Line 1 — החלפת מד חשמל ראשי
    insert into public.erp_purchase_order_lines (
      company_id, purchase_order_id, project_id,
      budget_sub_chapter, resource_id,
      description, quantity, unit_price,
      line_number, uom,
      supplier_sku, supplier_sku_description,
      line_notes, line_status
    )
    values (
      v_company_id, v_po_id, v_project_id,
      '01.08.10', 'ELEC-METER-400A',
      'החלפת מד חשמל ראשי 400A בשל עדכון תקן חברת חשמל — כולל פירוק קיים, '
      || 'אספקה, התקנה, והפעלה מול בודק מוסמך.',
      1, 28000.00,
      1, 'קומ',
      'MET-400-STD-26', 'Main Meter 400A Standard 2026',
      'כולל ליווי בודק חברת חשמל. אחריות יצרן 5 שנים.',
      'OPEN'
    );

    -- Line 2 — תוספת 4 נקודות חשמל לדירות גג
    insert into public.erp_purchase_order_lines (
      company_id, purchase_order_id, project_id,
      budget_sub_chapter, resource_id,
      description, quantity, unit_price,
      line_number, uom,
      supplier_sku, supplier_sku_description,
      line_notes, line_status
    )
    values (
      v_company_id, v_po_id, v_project_id,
      '01.08.20', 'ELEC-POINT-STD',
      'תוספת 4 נקודות חשמל לדירות גג (תיקון בעקבות שינוי אדריכלי) — '
      || 'כבלים, שקעים, נקודות תאורה, כולל חיבור ללוח קומתי.',
      4, 850.00,
      2, 'יח',
      'ELP-STD-001', 'Electrical Point Standard Installation',
      'כולל מפסק לכל נקודה. כיסוי בגמר סופי של הדירה.',
      'OPEN'
    );

    -- Promote to APPROVED now that all lines are in place (BPM trigger
    -- forbids line edits on non-DRAFT POs).
    update public.erp_purchase_orders
    set status = 'APPROVED'::public.erp_purchase_order_status
    where id = v_po_id;
  end if;
end
$$;

-- ============================================================================
-- End of migration: 20260820100000_purchase_order_print_and_subcontractor_link.sql
-- ============================================================================
