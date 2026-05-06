-- =============================================================================
-- Phase D — Seed Supplier "חשמל ישיר" (Yashir Hashmal)
-- =============================================================================
--
-- Phase D מוסיף זרימת Vision-to-PO: המשתמש מעלה שרטוט, ה-AI מעריך כמות,
-- ומבקש ליצור הזמנה מול ספק ספציפי בפקודה אחת. כדי שה-LLM יוכל לזהות
-- את הספק בתוך ה-grounding context ולהעביר את ה-UUID ל-RPC דרך
-- `p_supplier_id_override`, אנחנו שותלים ספק ייעודי "חשמל ישיר".
--
-- נעדכן גם את ה-preferred_supplier_id של 3 פריטי ה-AI-MOCK שנוצרו ב-Phase A,
-- כך שגם במסלולים ללא override הזרימה תעבוד ותיצור הזמנה עם תמחור ריאלי
-- (אחרת ה-fallback של "first supplier" היה עלול לבחור ספק אחר אקראי).
--
-- Idempotent: כל ה-UPSERTs מוגנים ב-on conflict, בטוח להרצה חוזרת.
-- אם אין חברה ב-erp_companies — הסיד מדלג בלי שגיאה (כמו Phase A).
-- =============================================================================

do $$
declare
  v_company_id        text;
  v_supplier_id       uuid;
  v_item_channel_id   uuid;
  v_item_support_id   uuid;
  v_item_screw_id     uuid;
begin
  -- 1) Pick first company (פיילוט — חד-tenant)
  select id into v_company_id
    from public.erp_companies
    order by created_at asc
    limit 1;

  if v_company_id is null then
    raise notice 'Phase D seed: no company found — skipping.';
    return;
  end if;

  raise notice 'Phase D seed: using company_id=%', v_company_id;

  -- 2) Upsert supplier "חשמל ישיר"
  --
  --    supplier_number מוגדר unique פר חברה (ראו
  --    20260626120000_erp_master_data_multitenant_foundation.sql:63-64).
  --    נבחר מספר ייעודי 'SUP-HASHMAL-YASHIR' כדי שיהיה קל לזיהוי ב-SQL/UI.
  -- tax_id / payment_terms / vat_code / supplier_type — NOT NULL מאז
  -- 20260626133000_erp_master_data_contract_alignment.sql, חייבים ערכים מפורשים.
  insert into public.erp_md_suppliers
    (company_id, supplier_number, supplier_kind, supplier_type,
     name, foreign_name,
     phone, email, payment_terms, tax_id, vat_code, currency_code)
  values
    (v_company_id, 'SUP-HASHMAL-YASHIR', 'supplier', 'STANDARD',
     'חשמל ישיר', 'Yashir Hashmal Ltd.',
     '03-9000000', 'orders@yashir-hashmal.co.il',
     'שוטף+30', '514567890', 'I', 'ILS')
  on conflict (company_id, supplier_number) do update set
    name = excluded.name,
    foreign_name = excluded.foreign_name,
    phone = excluded.phone,
    email = excluded.email
  returning id into v_supplier_id;

  raise notice 'Phase D seed: supplier חשמל ישיר id=%', v_supplier_id;

  -- 3) הזרקת preferred_supplier_id ל-3 פריטי ה-AI-MOCK של Phase A.
  --    לא נעדכן פריט שכבר יש לו preferred_supplier_id אחר (נכבד בחירה אנושית).
  select id into v_item_channel_id
    from public.erp_md_items
    where company_id = v_company_id and item_number = 'AI-MOCK-CHANNEL-100'
    limit 1;

  select id into v_item_support_id
    from public.erp_md_items
    where company_id = v_company_id and item_number = 'AI-MOCK-SUPPORT-100'
    limit 1;

  select id into v_item_screw_id
    from public.erp_md_items
    where company_id = v_company_id and item_number = 'AI-MOCK-SCREW-M6'
    limit 1;

  update public.erp_md_items
    set preferred_supplier_id = v_supplier_id
    where id in (v_item_channel_id, v_item_support_id, v_item_screw_id)
      and preferred_supplier_id is null;

  raise notice 'Phase D seed: linked חשמל ישיר as preferred_supplier on % items',
    (select count(*) from public.erp_md_items
      where id in (v_item_channel_id, v_item_support_id, v_item_screw_id)
        and preferred_supplier_id = v_supplier_id);
end $$;
