-- Priority Parity: PO Lines list_price (מחר"ל) + Attachments parity fields
--
-- 1. erp_purchase_order_lines — add list_price (מחיר רשימה / catalog price)
-- 2. erp_po_attachments — Priority parity: seq_number, is_closed,
--    include_in_delivery, updated_by, updated_at

-- ─── 1. erp_purchase_order_lines ─────────────────────────────────────────────
alter table public.erp_purchase_order_lines
  -- מחר"ל = מחיר רשימה — מחיר הקטלוג לפני הנחה (Priority: PRICE / PRICELIST)
  add column if not exists list_price numeric(18, 4) null;

comment on column public.erp_purchase_order_lines.list_price is
  'מחר"ל — מחיר רשימה/קטלוג לפני הנחה (Priority: PRICELIST). שונה מ-unit_price שהוא המחיר המוסכם.';

-- ─── 2. erp_po_attachments ───────────────────────────────────────────────────
alter table public.erp_po_attachments
  -- מספר ספרר — סדר צג (Priority: KLINE)
  add column if not exists seq_number          smallint       null,
  -- סגורה? — האם הקובץ "סגור"/לא פעיל (Priority: STATDES)
  add column if not exists is_closed           boolean        not null default false,
  -- משלוח — האם לשלוח עם המשלוח (Priority: PRINTFLG)
  add column if not exists include_in_delivery boolean        not null default false,
  -- עדכון עי / ת. עדכון אחרון
  add column if not exists updated_by         uuid           null references auth.users(id) on delete set null,
  add column if not exists updated_at         timestamptz    null;

comment on column public.erp_po_attachments.seq_number          is 'מספר ספרר — סדר תצוגה של הנספח (Priority: KLINE)';
comment on column public.erp_po_attachments.is_closed           is 'סגורה? — הנספח מסומן כ"סגור" / לא פעיל (Priority: STATDES)';
comment on column public.erp_po_attachments.include_in_delivery is 'משלוח — האם לכלול בטפסי המשלוח (Priority: PRINTFLG)';
comment on column public.erp_po_attachments.updated_by         is 'עדכון עי — UUID של המשתמש שעדכן לאחרונה';
comment on column public.erp_po_attachments.updated_at         is 'ת. עדכון אחרון';
