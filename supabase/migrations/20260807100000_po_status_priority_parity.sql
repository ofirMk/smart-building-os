-- =============================================================================
-- Phase A.1a — PO Status Enum Extension (Priority parity)
--
-- מטרה
--   להרחיב את ENUM erp_purchase_order_status ב-3 ערכים החסרים מול Priority:
--   PROFORMA, ON_SHIP, SHIPMENT_CONFIRMED.
--
-- ⚠️ למה פיצול A.1a (ENUM) + A.1b (table + seed)?
--   PostgreSQL לא מאפשר להשתמש בערך enum חדש באותה transaction שבה נוסף.
--   לכן הטבלה והזרעת הנתונים נמצאות ב-20260807100100_po_status_metadata_table.sql
--
-- תלות
--   * 20260801180000_po_approval_engine     (PENDING_APPROVAL)             ✅
--   * 20260803090000_po_sent_to_supplier    (SENT_TO_SUPPLIER)             ✅
--   * 20260804100000_goods_receipt_schema   (PARTIALLY_/FULLY_RECEIVED)    ✅
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_type where typname = 'erp_purchase_order_status') then
    alter type public.erp_purchase_order_status add value if not exists 'PROFORMA';
    alter type public.erp_purchase_order_status add value if not exists 'ON_SHIP';
    alter type public.erp_purchase_order_status add value if not exists 'SHIPMENT_CONFIRMED';
  end if;
end$$;
