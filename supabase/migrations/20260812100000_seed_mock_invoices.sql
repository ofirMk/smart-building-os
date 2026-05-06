-- =============================================================================
-- Phase 8.3 Step 2 — Seed Mock Vendor Invoices for 3-Way Match Demo
-- =============================================================================
-- מטרה
--   להזריק 2 חשבוניות "דמו" מול הספק "חשמל ישיר" (Phase D) המקושרות
--   ל-PO + GR מלאים, כדי שמסך ה-Reconciliation יוכל להריץ עליהן את
--   ה-RPC erp_perform_3way_match ולהראות:
--     • חשבונית #1 — PERFECT: כמות + מחיר תואמים ל-PO/GR.
--     • חשבונית #2 — MIXED_VARIANCE: חויבנו ביותר יחידות + במחיר גבוה.
--
--   הסיד יוצר את כל השרשרת מאפס בעסקה אחת אטומית.
--
-- אילוצי schema שכל סיד-PO חייב לכבד (Phase 6 BPM engine + Phase 8.x):
--   1. erp_validate_procurement_budget_line — חייבת להיות שורת תקציב
--      ב-erp_project_budget_lines תואמת ל-(project, sub_chapter, resource).
--      הסיד מבצע upsert של שורה כזו עם planned_amount = 1,000,000 לפני
--      שמכניס PO/GR/Invoice lines.
--   2. erp_po_lines_only_draft — לא ניתן להכניס שורות ל-PO שאינו DRAFT.
--      לכן: יוצרים PO כ-DRAFT, מכניסים שורות, ואז UPDATE לסטטוס סופי.
--   3. erp_require_final_receipt_for_invoice_link — לא רלוונטי פה
--      (אנחנו לא נוגעים ב-erp_vendor_invoice_receipts; הקישור Invoice→GR
--      נעשה ישירות דרך purchase_order_id/goods_receipt_id ב-header וגם
--      דרך purchase_order_line_id ב-lines, כפי ש-Phase 8.3 דורש).
--
-- Idempotency
--   po_number / gr_number / invoice_number דטרמיניסטיים (prefix 'MOCK-').
--   כל ה-INSERTs מוגנים ב-EXISTS check; הרצה חוזרת לא תיצור כפילויות
--   ולא תיכשל.
-- =============================================================================

do $$
declare
  v_company_id   text;
  v_project_id   uuid;
  v_supplier_id  uuid;
  v_item_id      uuid;
  v_item_uom     text;

  -- PO + line (perfect)
  v_po_perfect_id      uuid;
  v_po_perfect_line_id uuid;
  v_gr_perfect_id      uuid;
  v_gr_perfect_line_id uuid;
  v_inv_perfect_id     uuid;

  -- PO + line (variance)
  v_po_variance_id      uuid;
  v_po_variance_line_id uuid;
  v_gr_variance_id      uuid;
  v_gr_variance_line_id uuid;
  v_inv_variance_id     uuid;

  -- demo numerics — perfect
  c_perfect_qty         constant numeric := 10;
  c_perfect_unit_price  constant numeric := 150.00;

  -- demo numerics — variance
  c_variance_po_qty     constant numeric := 20;
  c_variance_gr_qty     constant numeric := 18;   -- קלטנו פחות
  c_variance_inv_qty    constant numeric := 22;   -- חויבנו על יותר ⇒ qty_diff = +4
  c_variance_po_price   constant numeric := 150.00;
  c_variance_inv_price  constant numeric := 170.00; -- חויבנו ביותר ⇒ price_diff = +20
begin
  -- ── 0) שליפת הקשר (חברה/פרויקט/ספק/פריט) ───────────────────────────────
  select id into v_company_id
    from public.erp_companies
    order by created_at asc
    limit 1;
  if v_company_id is null then
    raise notice 'Phase 8.3 seed: no company → skipping mock invoices.';
    return;
  end if;

  select id into v_project_id
    from public.erp_proj_projects
    where company_id = v_company_id
    order by created_at asc
    limit 1;
  if v_project_id is null then
    raise notice 'Phase 8.3 seed: no project for company % → skipping.', v_company_id;
    return;
  end if;

  select id into v_supplier_id
    from public.erp_md_suppliers
    where company_id = v_company_id and supplier_number = 'SUP-HASHMAL-YASHIR'
    limit 1;
  if v_supplier_id is null then
    raise notice 'Phase 8.3 seed: supplier SUP-HASHMAL-YASHIR not found → skipping.';
    return;
  end if;

  select id, uom into v_item_id, v_item_uom
    from public.erp_md_items
    where company_id = v_company_id and item_number = 'AI-MOCK-CHANNEL-100'
    limit 1;
  if v_item_id is null then
    raise notice 'Phase 8.3 seed: item AI-MOCK-CHANNEL-100 not found → skipping.';
    return;
  end if;
  v_item_uom := coalesce(v_item_uom, 'METER');

  raise notice 'Phase 8.3 seed: company=% project=% supplier=% item=%',
    v_company_id, v_project_id, v_supplier_id, v_item_id;

  -- ── 1) Budget line ל-(project, AI-PHASE-B, AUTO-RESOLVE) ──────────────
  -- erp_validate_procurement_budget_line דורש ש-(company,project,sub,resource)
  -- יקיים שורת תקציב פעילה. נכניס/נעדכן עם תקציב מספיק לכל ה-mocks.
  insert into public.erp_project_budget_lines
    (company_id, project_id, budget_sub_chapter, resource_id, planned_amount)
  values
    (v_company_id, v_project_id, 'AI-PHASE-B', 'AUTO-RESOLVE', 1000000)
  on conflict (company_id, project_id, budget_sub_chapter, resource_id)
  do update set planned_amount = greatest(erp_project_budget_lines.planned_amount, 1000000);

  raise notice 'Phase 8.3 seed: ensured budget line AI-PHASE-B/AUTO-RESOLVE.';

  -- ╔══════════════════════════════════════════════════════════════════════╗
  -- ║  PO #1 — PERFECT MATCH                                               ║
  -- ║  יוצרים כ-DRAFT (כדי שטריגר only_draft יאפשר insert של שורות)       ║
  -- ║  ואז מקדמים ל-FULLY_RECEIVED.                                        ║
  -- ╚══════════════════════════════════════════════════════════════════════╝
  select id into v_po_perfect_id
    from public.erp_purchase_orders
    where company_id = v_company_id and po_number = 'MOCK-PO-PERFECT-001';

  if v_po_perfect_id is null then
    insert into public.erp_purchase_orders (
      company_id, project_id, supplier_id, po_number, title, status,
      currency, total_amount_net, vat_amount, total_amount_gross,
      order_date, affects_planning, notes
    ) values (
      v_company_id, v_project_id, v_supplier_id,
      'MOCK-PO-PERFECT-001',
      'הזמנה לדוגמה — תעלות חשמל (תקינה)',
      'DRAFT'::public.erp_purchase_order_status,
      'ILS',
      round(c_perfect_qty * c_perfect_unit_price, 2),
      round(c_perfect_qty * c_perfect_unit_price * 0.17, 2),
      round(c_perfect_qty * c_perfect_unit_price * 1.17, 2),
      current_date - 7, true,
      'Phase 8.3 seed — PO לדמו 3-Way Match (PERFECT).'
    ) returning id into v_po_perfect_id;

    insert into public.erp_purchase_order_lines (
      company_id, purchase_order_id, project_id,
      budget_sub_chapter, resource_id,
      item_id, item_sku, description,
      quantity, unit_price, uom, line_number,
      line_currency, exchange_rate, price_source,
      received_qty
    ) values (
      v_company_id, v_po_perfect_id, v_project_id,
      'AI-PHASE-B', 'AUTO-RESOLVE',
      v_item_id, 'AI-MOCK-CHANNEL-100',
      'תעלת חשמל 100 מ"מ — דוגמה (PERFECT)',
      c_perfect_qty, c_perfect_unit_price,
      v_item_uom, 1,
      'ILS', 1, 'SUPPLIER_PRICELIST',
      c_perfect_qty   -- כל הכמות שהוזמנה — נקלטה (יסומן CLOSED ע"י line_status trigger)
    ) returning id into v_po_perfect_line_id;

    -- קידום סטטוס לאחר שהשורות נכנסו (only_draft trigger לא חוסם UPDATE על ה-header).
    update public.erp_purchase_orders
      set status = 'FULLY_RECEIVED'::public.erp_purchase_order_status
      where id = v_po_perfect_id;

    -- GR תואם
    insert into public.erp_goods_receipts (
      company_id, purchase_order_id, gr_number, status,
      receipt_date, received_at, vendor_delivery_note, notes
    ) values (
      v_company_id, v_po_perfect_id,
      'MOCK-GR-PERFECT-001',
      'COMPLETED'::public.erp_goods_receipt_status,
      current_date - 5,
      (current_date - 5)::timestamptz + interval '10 hours',
      'DN-MOCK-PERFECT-001',
      'Phase 8.3 seed — GR תואם לדמו PERFECT.'
    ) returning id into v_gr_perfect_id;

    insert into public.erp_goods_receipt_lines (
      company_id, goods_receipt_id, purchase_order_line_id,
      project_id, budget_sub_chapter, resource_id,
      item_id, description, quantity, unit_price
    ) values (
      v_company_id, v_gr_perfect_id, v_po_perfect_line_id,
      v_project_id, 'AI-PHASE-B', 'AUTO-RESOLVE',
      v_item_id,
      'תעלת חשמל 100 מ"מ — נקלט (PERFECT)',
      c_perfect_qty, c_perfect_unit_price
    ) returning id into v_gr_perfect_line_id;

    raise notice 'Phase 8.3 seed: PERFECT PO=% line=% GR=%',
      v_po_perfect_id, v_po_perfect_line_id, v_gr_perfect_id;
  else
    select id into v_po_perfect_line_id
      from public.erp_purchase_order_lines
      where company_id = v_company_id and purchase_order_id = v_po_perfect_id
      order by line_number asc nulls last
      limit 1;
    select id into v_gr_perfect_id
      from public.erp_goods_receipts
      where company_id = v_company_id and gr_number = 'MOCK-GR-PERFECT-001';
    select id into v_gr_perfect_line_id
      from public.erp_goods_receipt_lines
      where company_id = v_company_id and goods_receipt_id = v_gr_perfect_id
      limit 1;
    raise notice 'Phase 8.3 seed: PERFECT chain already exists — reusing.';
  end if;

  -- חשבונית PERFECT — תואמת בדיוק ל-PO/GR
  if v_po_perfect_line_id is not null then
    select id into v_inv_perfect_id
      from public.erp_vendor_invoices
      where company_id = v_company_id and invoice_number = 'MOCK-INV-PERFECT-001';

    if v_inv_perfect_id is null then
      insert into public.erp_vendor_invoices (
        company_id, supplier_id, invoice_number, status,
        invoice_date, total_amount, price_variance_amount,
        purchase_order_id, goods_receipt_id, notes
      ) values (
        v_company_id, v_supplier_id,
        'MOCK-INV-PERFECT-001',
        'NEW'::public.erp_vendor_invoice_status,
        current_date - 2,
        round(c_perfect_qty * c_perfect_unit_price * 1.17, 2),
        0,
        v_po_perfect_id, v_gr_perfect_id,
        'Phase 8.3 seed — חשבונית דמו תקינה. הרץ 3-Way Match → PERFECT.'
      ) returning id into v_inv_perfect_id;

      insert into public.erp_vendor_invoice_lines (
        company_id, vendor_invoice_id,
        purchase_order_line_id, goods_receipt_line_id,
        project_id, budget_sub_chapter, resource_id,
        description, quantity, unit_price
      ) values (
        v_company_id, v_inv_perfect_id,
        v_po_perfect_line_id, v_gr_perfect_line_id,
        v_project_id, 'AI-PHASE-B', 'AUTO-RESOLVE',
        'תעלת חשמל 100 מ"מ — חויב (PERFECT)',
        c_perfect_qty, c_perfect_unit_price
      );

      raise notice 'Phase 8.3 seed: created PERFECT invoice=%', v_inv_perfect_id;
    end if;
  end if;

  -- ╔══════════════════════════════════════════════════════════════════════╗
  -- ║  PO #2 — VARIANCE (qty + price)                                      ║
  -- ╚══════════════════════════════════════════════════════════════════════╝
  select id into v_po_variance_id
    from public.erp_purchase_orders
    where company_id = v_company_id and po_number = 'MOCK-PO-VARIANCE-001';

  if v_po_variance_id is null then
    insert into public.erp_purchase_orders (
      company_id, project_id, supplier_id, po_number, title, status,
      currency, total_amount_net, vat_amount, total_amount_gross,
      order_date, affects_planning, notes
    ) values (
      v_company_id, v_project_id, v_supplier_id,
      'MOCK-PO-VARIANCE-001',
      'הזמנה לדוגמה — תעלות חשמל (חורגת)',
      'DRAFT'::public.erp_purchase_order_status,
      'ILS',
      round(c_variance_po_qty * c_variance_po_price, 2),
      round(c_variance_po_qty * c_variance_po_price * 0.17, 2),
      round(c_variance_po_qty * c_variance_po_price * 1.17, 2),
      current_date - 6, true,
      'Phase 8.3 seed — PO לדמו 3-Way Match (VARIANCE).'
    ) returning id into v_po_variance_id;

    insert into public.erp_purchase_order_lines (
      company_id, purchase_order_id, project_id,
      budget_sub_chapter, resource_id,
      item_id, item_sku, description,
      quantity, unit_price, uom, line_number,
      line_currency, exchange_rate, price_source,
      received_qty
    ) values (
      v_company_id, v_po_variance_id, v_project_id,
      'AI-PHASE-B', 'AUTO-RESOLVE',
      v_item_id, 'AI-MOCK-CHANNEL-100',
      'תעלת חשמל 100 מ"מ — דוגמה (VARIANCE)',
      c_variance_po_qty, c_variance_po_price,
      v_item_uom, 1,
      'ILS', 1, 'SUPPLIER_PRICELIST',
      c_variance_gr_qty   -- קלטנו פחות מההזמנה (PARTIAL)
    ) returning id into v_po_variance_line_id;

    update public.erp_purchase_orders
      set status = 'PARTIALLY_RECEIVED'::public.erp_purchase_order_status
      where id = v_po_variance_id;

    insert into public.erp_goods_receipts (
      company_id, purchase_order_id, gr_number, status,
      receipt_date, received_at, vendor_delivery_note, notes
    ) values (
      v_company_id, v_po_variance_id,
      'MOCK-GR-VARIANCE-001',
      'COMPLETED'::public.erp_goods_receipt_status,
      current_date - 4,
      (current_date - 4)::timestamptz + interval '14 hours',
      'DN-MOCK-VARIANCE-001',
      'Phase 8.3 seed — GR חלקי (קלטנו 18 מתוך 20).'
    ) returning id into v_gr_variance_id;

    insert into public.erp_goods_receipt_lines (
      company_id, goods_receipt_id, purchase_order_line_id,
      project_id, budget_sub_chapter, resource_id,
      item_id, description, quantity, unit_price
    ) values (
      v_company_id, v_gr_variance_id, v_po_variance_line_id,
      v_project_id, 'AI-PHASE-B', 'AUTO-RESOLVE',
      v_item_id,
      'תעלת חשמל 100 מ"מ — נקלט (VARIANCE)',
      c_variance_gr_qty, c_variance_po_price
    ) returning id into v_gr_variance_line_id;

    raise notice 'Phase 8.3 seed: VARIANCE PO=% line=% GR=%',
      v_po_variance_id, v_po_variance_line_id, v_gr_variance_id;
  else
    select id into v_po_variance_line_id
      from public.erp_purchase_order_lines
      where company_id = v_company_id and purchase_order_id = v_po_variance_id
      order by line_number asc nulls last
      limit 1;
    select id into v_gr_variance_id
      from public.erp_goods_receipts
      where company_id = v_company_id and gr_number = 'MOCK-GR-VARIANCE-001';
    select id into v_gr_variance_line_id
      from public.erp_goods_receipt_lines
      where company_id = v_company_id and goods_receipt_id = v_gr_variance_id
      limit 1;
    raise notice 'Phase 8.3 seed: VARIANCE chain already exists — reusing.';
  end if;

  -- חשבונית VARIANCE — חויבנו על יותר יחידות (22) ועל מחיר גבוה (170)
  if v_po_variance_line_id is not null then
    select id into v_inv_variance_id
      from public.erp_vendor_invoices
      where company_id = v_company_id and invoice_number = 'MOCK-INV-VARIANCE-001';

    if v_inv_variance_id is null then
      insert into public.erp_vendor_invoices (
        company_id, supplier_id, invoice_number, status,
        invoice_date, total_amount, price_variance_amount,
        purchase_order_id, goods_receipt_id, notes
      ) values (
        v_company_id, v_supplier_id,
        'MOCK-INV-VARIANCE-001',
        'NEW'::public.erp_vendor_invoice_status,
        current_date - 1,
        round(c_variance_inv_qty * c_variance_inv_price * 1.17, 2),
        round((c_variance_inv_price - c_variance_po_price) * c_variance_inv_qty, 2),
        v_po_variance_id, v_gr_variance_id,
        'Phase 8.3 seed — חשבונית דמו עם חריגות (qty + price). הרץ 3-Way Match → MIXED_VARIANCE.'
      ) returning id into v_inv_variance_id;

      insert into public.erp_vendor_invoice_lines (
        company_id, vendor_invoice_id,
        purchase_order_line_id, goods_receipt_line_id,
        project_id, budget_sub_chapter, resource_id,
        description, quantity, unit_price
      ) values (
        v_company_id, v_inv_variance_id,
        v_po_variance_line_id, v_gr_variance_line_id,
        v_project_id, 'AI-PHASE-B', 'AUTO-RESOLVE',
        'תעלת חשמל 100 מ"מ — חויב (VARIANCE: qty +4, price +20)',
        c_variance_inv_qty, c_variance_inv_price
      );

      raise notice 'Phase 8.3 seed: created VARIANCE invoice=%', v_inv_variance_id;
    end if;
  end if;

  raise notice 'Phase 8.3 seed: complete. Open /marker-ofek/finance/reconciliation.';
end $$;
