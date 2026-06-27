-- =============================================================================
-- Migration: Procurement Safety Guards — Phase 1 (P0-01 to P0-06)
-- Description: אכיפת שלמות נתונים ברמת ה-DB למודול הרכש
-- Date: 2024-07-05
-- =============================================================================

-- -----------------------------------------------------------------------------
-- P0-01: CHECK constraints על purchase_order_lines
-- quantity חייב להיות גדול מ-0
-- unit_price חייב להיות גדול או שווה ל-0
-- -----------------------------------------------------------------------------

ALTER TABLE public.purchase_order_lines
  DROP CONSTRAINT IF EXISTS chk_pol_quantity_positive,
  ADD  CONSTRAINT chk_pol_quantity_positive
    CHECK (quantity > 0);

ALTER TABLE public.purchase_order_lines
  DROP CONSTRAINT IF EXISTS chk_pol_unit_price_non_negative,
  ADD  CONSTRAINT chk_pol_unit_price_non_negative
    CHECK (unit_price >= 0);

-- -----------------------------------------------------------------------------
-- P0-02: מניעת UPDATE/DELETE על purchase_orders בסטטוס ISSUED או CLOSED
-- ואכיפת מעברי סטטוס חוקיים בלבד
-- תיקון: הסרת SECURITY DEFINER מפונקציות trigger — triggers רצים עם
--        הרשאות בעל הטבלה ממילא. SECURITY DEFINER מיותר וגורם לאזהרות.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_guard_po_immutable_statuses()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- -----------------------------------------------------------------------
  -- טיפול ב-DELETE
  -- -----------------------------------------------------------------------
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('ISSUED', 'CLOSED') THEN
      RAISE EXCEPTION
        'P0-02: לא ניתן למחוק הזמנת רכש בסטטוס %. מזהה הזמנה: %',
        OLD.status, OLD.id
        USING ERRCODE = 'P0002';
    END IF;
    RETURN OLD;
  END IF;

  -- -----------------------------------------------------------------------
  -- טיפול ב-UPDATE — אכיפת State Machine
  -- -----------------------------------------------------------------------
  IF TG_OP = 'UPDATE' THEN

    -- מ-CLOSED: אין שום מעבר מותר
    IF OLD.status = 'CLOSED' THEN
      RAISE EXCEPTION
        'P0-02: לא ניתן לשנות הזמנת רכש סגורה (CLOSED). מזהה הזמנה: %',
        OLD.id
        USING ERRCODE = 'P0002';
    END IF;

    -- מ-ISSUED: מותר רק ל-PARTIALLY_RECEIVED, FULLY_RECEIVED, CLOSED
    IF OLD.status = 'ISSUED' THEN
      IF NEW.status NOT IN ('PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED') THEN
        RAISE EXCEPTION
          'P0-02: מעבר סטטוס לא חוקי מ-ISSUED ל-%. מזהה הזמנה: %',
          NEW.status, OLD.id
          USING ERRCODE = 'P0002';
      END IF;
      RETURN NEW;
    END IF;

    -- מ-PARTIALLY_RECEIVED: מותר רק ל-FULLY_RECEIVED, CLOSED
    IF OLD.status = 'PARTIALLY_RECEIVED' THEN
      IF NEW.status NOT IN ('FULLY_RECEIVED', 'CLOSED') THEN
        RAISE EXCEPTION
          'P0-02: מעבר סטטוס לא חוקי מ-PARTIALLY_RECEIVED ל-%. מזהה הזמנה: %',
          NEW.status, OLD.id
          USING ERRCODE = 'P0002';
      END IF;
      RETURN NEW;
    END IF;

    -- מ-FULLY_RECEIVED: מותר רק ל-CLOSED
    IF OLD.status = 'FULLY_RECEIVED' THEN
      IF NEW.status != 'CLOSED' THEN
        RAISE EXCEPTION
          'P0-02: מעבר סטטוס לא חוקי מ-FULLY_RECEIVED ל-%. מזהה הזמנה: %',
          NEW.status, OLD.id
          USING ERRCODE = 'P0002';
      END IF;
      RETURN NEW;
    END IF;

  END IF;

  -- ברירת מחדל: אפשר את הפעולה (DRAFT, PENDING_APPROVAL, APPROVED, CANCELLED)
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_guard_po_immutable_statuses() IS
  'P0-02: מונע עריכה או מחיקה של הזמנת רכש בסטטוסים נעולים ואוכף מעברי סטטוס חוקיים';

DROP TRIGGER IF EXISTS trg_guard_po_immutable_statuses ON public.purchase_orders;

CREATE TRIGGER trg_guard_po_immutable_statuses
  BEFORE UPDATE OR DELETE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_po_immutable_statuses();

-- -----------------------------------------------------------------------------
-- P0-03: מניעת ביטול PO (CANCELLED) כאשר קיים GR מקושר
-- הערה: PostgreSQL מריץ BEFORE triggers לפי סדר אלפביתי של שמם.
--       trg_guard_po_cancel_with_gr רץ לפני trg_guard_po_immutable_statuses.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_guard_po_cancel_with_gr()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_gr_count INTEGER;
BEGIN
  IF NEW.status = 'CANCELLED' AND OLD.status != 'CANCELLED' THEN

    SELECT COUNT(*)
    INTO v_gr_count
    FROM public.goods_receipts gr
    WHERE gr.purchase_order_id = OLD.id;

    IF v_gr_count > 0 THEN
      RAISE EXCEPTION
        'P0-03: לא ניתן לבטל הזמנת רכש % — קיימות % תעודות משלוח מקושרות.',
        OLD.id, v_gr_count
        USING ERRCODE = 'P0003';
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_guard_po_cancel_with_gr() IS
  'P0-03: מונע ביטול הזמנת רכש כאשר קיימות תעודות משלוח מקושרות';

DROP TRIGGER IF EXISTS trg_guard_po_cancel_with_gr ON public.purchase_orders;

CREATE TRIGGER trg_guard_po_cancel_with_gr
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_po_cancel_with_gr();

-- -----------------------------------------------------------------------------
-- P0-04: מניעת GR בכמות חריגה מעל הכמות שנותרה להזמנה
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_guard_gr_quantity_overflow()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_ordered_qty      NUMERIC;
  v_already_received NUMERIC;
  v_remaining_qty    NUMERIC;
  v_po_line_id       UUID;
  v_po_status        TEXT;
BEGIN
  v_po_line_id := NEW.purchase_order_line_id;

  IF v_po_line_id IS NULL THEN
    RAISE EXCEPTION
      'P0-04: purchase_order_line_id הוא שדה חובה בתעודת משלוח'
      USING ERRCODE = 'P0004';
  END IF;

  SELECT po.status
  INTO v_po_status
  FROM public.purchase_orders po
  INNER JOIN public.purchase_order_lines pol
    ON pol.purchase_order_id = po.id
  WHERE pol.id = v_po_line_id
  LIMIT 1;

  IF v_po_status IS NULL THEN
    RAISE EXCEPTION
      'P0-04: לא נמצאה שורת הזמנת רכש עם מזהה %',
      v_po_line_id
      USING ERRCODE = 'P0004';
  END IF;

  IF v_po_status NOT IN ('ISSUED', 'PARTIALLY_RECEIVED') THEN
    RAISE EXCEPTION
      'P0-04: לא ניתן לרשום קבלת סחורה — הזמנת הרכש בסטטוס % (נדרש: ISSUED או PARTIALLY_RECEIVED)',
      v_po_status
      USING ERRCODE = 'P0004';
  END IF;

  SELECT pol.quantity
  INTO v_ordered_qty
  FROM public.purchase_order_lines pol
  WHERE pol.id = v_po_line_id;

  SELECT COALESCE(SUM(gr.received_quantity), 0)
  INTO v_already_received
  FROM public.goods_receipts gr
  WHERE gr.purchase_order_line_id = v_po_line_id
    AND (TG_OP = 'INSERT' OR gr.id != NEW.id);

  v_remaining_qty := v_ordered_qty - v_already_received;

  IF NEW.received_quantity <= 0 THEN
    RAISE EXCEPTION
      'P0-04: כמות הקבלה חייבת להיות גדולה מ-0. התקבל: %',
      NEW.received_quantity
      USING ERRCODE = 'P0004';
  END IF;

  IF NEW.received_quantity > v_remaining_qty THEN
    RAISE EXCEPTION
      'P0-04: כמות הקבלה (%) חורגת מהכמות שנותרה להזמנה (%). הוזמן: %, התקבל עד כה: %',
      NEW.received_quantity, v_remaining_qty, v_ordered_qty, v_already_received
      USING ERRCODE = 'P0004';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_guard_gr_quantity_overflow() IS
  'P0-04: מונע רישום קבלת סחורה בכמות החורגת מהכמות שנותרה בהזמנת הרכש';

DROP TRIGGER IF EXISTS trg_guard_gr_quantity_overflow ON public.goods_receipts;

CREATE TRIGGER trg_guard_gr_quantity_overflow
  BEFORE INSERT OR UPDATE ON public.goods_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_gr_quantity_overflow();

-- -----------------------------------------------------------------------------
-- P0-05: מניעת מחיקת שורת PO שכבר קושרה לתעודת משלוח (GR)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_guard_pol_delete_with_gr()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_gr_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_gr_count
  FROM public.goods_receipts gr
  WHERE gr.purchase_order_line_id = OLD.id;

  IF v_gr_count > 0 THEN
    RAISE EXCEPTION
      'P0-05: לא ניתן למחוק שורת הזמנת רכש % — קיימות % תעודות משלוח מקושרות.',
      OLD.id, v_gr_count
      USING ERRCODE = 'P0005';
  END IF;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.fn_guard_pol_delete_with_gr() IS
  'P0-05: מונע מחיקת שורת הזמנת רכש שכבר קושרה לתעודת משלוח';

DROP TRIGGER IF EXISTS trg_guard_pol_delete_with_gr ON public.purchase_order_lines;

CREATE TRIGGER trg_guard_pol_delete_with_gr
  BEFORE DELETE ON public.purchase_order_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_pol_delete_with_gr();

-- -----------------------------------------------------------------------------
-- P0-06: מניעת שמירת PO ללא שורות (לפחות שורה אחת)
-- BEFORE DELETE — סופרים שורות שנותרות לאחר המחיקה
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_guard_po_min_one_line()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_line_count INTEGER;
  v_po_status  TEXT;
  v_po_exists  BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.purchase_orders po
    WHERE po.id = OLD.purchase_order_id
  ) INTO v_po_exists;

  IF NOT v_po_exists THEN
    RETURN OLD;
  END IF;

  SELECT po.status
  INTO v_po_status
  FROM public.purchase_orders po
  WHERE po.id = OLD.purchase_order_id;

  IF v_po_status NOT IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED') THEN
    RETURN OLD;
  END IF;

  SELECT COUNT(*)
  INTO v_line_count
  FROM public.purchase_order_lines pol
  WHERE pol.purchase_order_id = OLD.purchase_order_id
    AND pol.id != OLD.id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION
      'P0-06: לא ניתן למחוק את כל שורות הזמנת הרכש %. הזמנה חייבת להכיל לפחות שורה אחת.',
      OLD.purchase_order_id
      USING ERRCODE = 'P0006';
  END IF;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.fn_guard_po_min_one_line() IS
  'P0-06: מונע מחיקת כל שורות הזמנת הרכש — חייבת להישאר לפחות שורה אחת';

DROP TRIGGER IF EXISTS trg_guard_po_min_one_line ON public.purchase_order_lines;

CREATE TRIGGER trg_guard_po_min_one_line
  BEFORE DELETE ON public.purchase_order_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_po_min_one_line();

-- -----------------------------------------------------------------------------
-- אינדקסים תומכים לביצועי ה-triggers
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_goods_receipts_po_line_id
  ON public.goods_receipts(purchase_order_line_id);

CREATE INDEX IF NOT EXISTS idx_goods_receipts_po_id
  ON public.goods_receipts(purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_po_id
  ON public.purchase_order_lines(purchase_order_id);

-- =============================================================================
-- סיכום: Guards שהוטמעו
-- =============================================================================
-- P0-01: CHECK quantity > 0 ו-unit_price >= 0 על purchase_order_lines
-- P0-02: TRIGGER מניעת UPDATE/DELETE על PO בסטטוס ISSUED/CLOSED + מעברי סטטוס חוקיים
-- P0-03: TRIGGER מניעת CANCELLED על PO עם GR מקושר
-- P0-04: TRIGGER מניעת GR בכמות חריגה + בדיקת NULL + בדיקת סטטוס PO
-- P0-05: TRIGGER מניעת מחיקת שורת PO עם GR מקושר
-- P0-06: TRIGGER מניעת מחיקת כל שורות PO (מינימום שורה אחת)
-- =============================================================================
