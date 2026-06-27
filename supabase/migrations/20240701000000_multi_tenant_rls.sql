-- =============================================================================
-- Migration: Multi-Tenant RLS Foundation
-- Description: יצירת תשתית מולטי-טנאנט עם Row Level Security מקיף
-- Date: 2024-07-01
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION 1: טבלת tenants — הטבלה המרכזית של כל לקוח/חברה
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenants (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL UNIQUE,
  status      TEXT        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'suspended', 'cancelled', 'trial')),
  plan        TEXT        NOT NULL DEFAULT 'trial'
                          CHECK (plan IN ('trial', 'basic', 'pro', 'enterprise')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.tenants        IS 'כל שורה מייצגת לקוח/חברה אחת במערכת ה-SaaS';
COMMENT ON COLUMN public.tenants.slug   IS 'מזהה ייחודי ידידותי לשימוש ב-URL, לדוגמה: marker-ofek';
COMMENT ON COLUMN public.tenants.status IS 'מצב הטנאנט: active, suspended, cancelled, trial';
COMMENT ON COLUMN public.tenants.plan   IS 'תוכנית המנוי: trial, basic, pro, enterprise';

-- -----------------------------------------------------------------------------
-- פונקציית עזר לעדכון updated_at
-- תיקון סופי: search_path = '' (ריק) — הדרך הבטוחה ביותר לפי תיעוד Supabase.
--             auth.uid() נקרא עם שם מלא ולכן לא צריך את auth ב-search_path.
--             הוספת auth ל-search_path גורמת לאזהרת אבטחה ב-linter.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tenants_set_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- SECTION 2: טבלת user_profiles — קישור בין Supabase Auth לטנאנט
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id   UUID        REFERENCES public.tenants(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL DEFAULT 'member'
                          CHECK (role IN (
                            'tenant_admin',
                            'member',
                            'billing_manager',
                            'read_only',
                            'super_admin'
                          )),
  full_name   TEXT,
  email       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.user_profiles           IS 'פרופיל משתמש המקשר בין auth.users לטנאנט ולתפקיד';
COMMENT ON COLUMN public.user_profiles.role      IS 'תפקיד המשתמש בתוך הטנאנט שלו';
COMMENT ON COLUMN public.user_profiles.tenant_id IS 'NULL מותר זמנית עד לסיום תהליך ה-Onboarding';

CREATE TRIGGER user_profiles_set_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant_id
  ON public.user_profiles(tenant_id);

-- -----------------------------------------------------------------------------
-- SECTION 3: פונקציות עזר לשימוש ב-RLS
-- תיקון סופי: search_path = '' — auth.uid() נקרא עם schema מלא ולכן עובד
--             גם ללא auth ב-search_path. זהו הפורמט המאושר ע"י Supabase.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tenant_id
  FROM public.user_profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_my_tenant_id() IS
  'מחזירה את tenant_id של המשתמש המחובר כרגע. משמשת את פוליסות ה-RLS.';

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role
  FROM public.user_profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_my_role() IS
  'מחזירה את התפקיד של המשתמש המחובר כרגע.';

CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = auth.uid()
      AND role IN ('tenant_admin', 'super_admin')
  );
$$;

COMMENT ON FUNCTION public.is_tenant_admin() IS
  'מחזירה TRUE אם המשתמש המחובר הוא tenant_admin או super_admin.';

-- -----------------------------------------------------------------------------
-- SECTION 4a: הוספת עמודת tenant_id לטבלאות הליבה (NULLABLE תחילה)
-- -----------------------------------------------------------------------------

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT;

ALTER TABLE public.goods_receipts
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT;

ALTER TABLE public.vendor_invoices
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT;

ALTER TABLE public.contract_lines
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT;

ALTER TABLE public.purchase_order_lines
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE RESTRICT;

-- -----------------------------------------------------------------------------
-- SECTION 4b: יצירת טנאנט ברירת מחדל ועדכון נתונים קיימים
-- -----------------------------------------------------------------------------

DO $migration$
DECLARE
  v_tenant_id uuid;
BEGIN
  INSERT INTO public.tenants (id, name, slug, status, plan)
  VALUES (
    gen_random_uuid(),
    'Marker Ofek',
    'marker-ofek',
    'active',
    'enterprise'
  )
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO v_tenant_id
  FROM public.tenants
  WHERE slug = 'marker-ofek';

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Failed to create or find default tenant for slug: marker-ofek';
  END IF;

  UPDATE public.projects             SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.contracts            SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.purchase_orders      SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.goods_receipts       SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.vendor_invoices      SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.contract_lines       SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.purchase_order_lines SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;

  RAISE NOTICE 'Default tenant seeded with id: %', v_tenant_id;
END;
$migration$
LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- SECTION 4c: אכיפת NOT NULL לאחר מילוי הנתונים
-- -----------------------------------------------------------------------------

ALTER TABLE public.projects             ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.contracts            ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.purchase_orders      ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.goods_receipts       ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.vendor_invoices      ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.contract_lines       ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.purchase_order_lines ALTER COLUMN tenant_id SET NOT NULL;

-- -----------------------------------------------------------------------------
-- SECTION 5: אינדקסים לביצועים
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_projects_tenant_id
  ON public.projects(tenant_id);

CREATE INDEX IF NOT EXISTS idx_contracts_tenant_id
  ON public.contracts(tenant_id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_id
  ON public.purchase_orders(tenant_id);

CREATE INDEX IF NOT EXISTS idx_goods_receipts_tenant_id
  ON public.goods_receipts(tenant_id);

CREATE INDEX IF NOT EXISTS idx_vendor_invoices_tenant_id
  ON public.vendor_invoices(tenant_id);

CREATE INDEX IF NOT EXISTS idx_contract_lines_tenant_id
  ON public.contract_lines(tenant_id);

CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_tenant_id
  ON public.purchase_order_lines(tenant_id);

-- -----------------------------------------------------------------------------
-- SECTION 6: הפעלת Row Level Security
-- -----------------------------------------------------------------------------

ALTER TABLE public.tenants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_lines       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- SECTION 7: פוליסות RLS — טבלת tenants
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "tenants_select_own"         ON public.tenants;
DROP POLICY IF EXISTS "tenants_insert_super_admin" ON public.tenants;
DROP POLICY IF EXISTS "tenants_update_super_admin" ON public.tenants;
DROP POLICY IF EXISTS "tenants_delete_super_admin" ON public.tenants;

CREATE POLICY "tenants_select_own"
  ON public.tenants FOR SELECT
  USING (id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "tenants_insert_super_admin"
  ON public.tenants FOR INSERT
  WITH CHECK ((SELECT public.get_my_role()) = 'super_admin');

CREATE POLICY "tenants_update_super_admin"
  ON public.tenants FOR UPDATE
  USING     ((SELECT public.get_my_role()) = 'super_admin')
  WITH CHECK ((SELECT public.get_my_role()) = 'super_admin');

CREATE POLICY "tenants_delete_super_admin"
  ON public.tenants FOR DELETE
  USING ((SELECT public.get_my_role()) = 'super_admin');

-- -----------------------------------------------------------------------------
-- SECTION 8: פוליסות RLS — טבלת user_profiles
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "user_profiles_select_same_tenant"   ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_insert_admin"         ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_update_admin_or_self" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_delete_admin"         ON public.user_profiles;

CREATE POLICY "user_profiles_select_same_tenant"
  ON public.user_profiles FOR SELECT
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "user_profiles_insert_admin"
  ON public.user_profiles FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.is_tenant_admin())
  );

CREATE POLICY "user_profiles_update_admin_or_self"
  ON public.user_profiles FOR UPDATE
  USING (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (id = (SELECT auth.uid()) OR (SELECT public.is_tenant_admin()))
  )
  WITH CHECK (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (id = (SELECT auth.uid()) OR (SELECT public.is_tenant_admin()))
  );

CREATE POLICY "user_profiles_delete_admin"
  ON public.user_profiles FOR DELETE
  USING (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.is_tenant_admin())
    AND id <> (SELECT auth.uid())
  );

-- -----------------------------------------------------------------------------
-- SECTION 9: פוליסות RLS — טבלת projects
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "projects_select_own_tenant" ON public.projects;
DROP POLICY IF EXISTS "projects_insert_own_tenant" ON public.projects;
DROP POLICY IF EXISTS "projects_update_own_tenant" ON public.projects;
DROP POLICY IF EXISTS "projects_delete_admin_only" ON public.projects;

CREATE POLICY "projects_select_own_tenant"
  ON public.projects FOR SELECT
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "projects_insert_own_tenant"
  ON public.projects FOR INSERT
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "projects_update_own_tenant"
  ON public.projects FOR UPDATE
  USING     (tenant_id = (SELECT public.get_my_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "projects_delete_admin_only"
  ON public.projects FOR DELETE
  USING (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.is_tenant_admin())
  );

-- -----------------------------------------------------------------------------
-- SECTION 10: פוליסות RLS — טבלת contracts
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "contracts_select_own_tenant" ON public.contracts;
DROP POLICY IF EXISTS "contracts_insert_own_tenant" ON public.contracts;
DROP POLICY IF EXISTS "contracts_update_own_tenant" ON public.contracts;
DROP POLICY IF EXISTS "contracts_delete_admin_only" ON public.contracts;

CREATE POLICY "contracts_select_own_tenant"
  ON public.contracts FOR SELECT
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "contracts_insert_own_tenant"
  ON public.contracts FOR INSERT
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "contracts_update_own_tenant"
  ON public.contracts FOR UPDATE
  USING     (tenant_id = (SELECT public.get_my_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "contracts_delete_admin_only"
  ON public.contracts FOR DELETE
  USING (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.is_tenant_admin())
  );

-- -----------------------------------------------------------------------------
-- SECTION 11: פוליסות RLS — טבלת purchase_orders
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "purchase_orders_select_own_tenant" ON public.purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_insert_own_tenant" ON public.purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_update_own_tenant" ON public.purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_delete_admin_only" ON public.purchase_orders;

CREATE POLICY "purchase_orders_select_own_tenant"
  ON public.purchase_orders FOR SELECT
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "purchase_orders_insert_own_tenant"
  ON public.purchase_orders FOR INSERT
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "purchase_orders_update_own_tenant"
  ON public.purchase_orders FOR UPDATE
  USING     (tenant_id = (SELECT public.get_my_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "purchase_orders_delete_admin_only"
  ON public.purchase_orders FOR DELETE
  USING (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.is_tenant_admin())
  );

-- -----------------------------------------------------------------------------
-- SECTION 12: פוליסות RLS — טבלת goods_receipts
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "goods_receipts_select_own_tenant" ON public.goods_receipts;
DROP POLICY IF EXISTS "goods_receipts_insert_own_tenant" ON public.goods_receipts;
DROP POLICY IF EXISTS "goods_receipts_update_own_tenant" ON public.goods_receipts;
DROP POLICY IF EXISTS "goods_receipts_delete_admin_only" ON public.goods_receipts;

CREATE POLICY "goods_receipts_select_own_tenant"
  ON public.goods_receipts FOR SELECT
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "goods_receipts_insert_own_tenant"
  ON public.goods_receipts FOR INSERT
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "goods_receipts_update_own_tenant"
  ON public.goods_receipts FOR UPDATE
  USING     (tenant_id = (SELECT public.get_my_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "goods_receipts_delete_admin_only"
  ON public.goods_receipts FOR DELETE
  USING (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.is_tenant_admin())
  );

-- -----------------------------------------------------------------------------
-- SECTION 13: פוליסות RLS — טבלת vendor_invoices
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "vendor_invoices_select_own_tenant" ON public.vendor_invoices;
DROP POLICY IF EXISTS "vendor_invoices_insert_own_tenant" ON public.vendor_invoices;
DROP POLICY IF EXISTS "vendor_invoices_update_own_tenant" ON public.vendor_invoices;
DROP POLICY IF EXISTS "vendor_invoices_delete_admin_only" ON public.vendor_invoices;

CREATE POLICY "vendor_invoices_select_own_tenant"
  ON public.vendor_invoices FOR SELECT
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "vendor_invoices_insert_own_tenant"
  ON public.vendor_invoices FOR INSERT
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "vendor_invoices_update_own_tenant"
  ON public.vendor_invoices FOR UPDATE
  USING     (tenant_id = (SELECT public.get_my_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "vendor_invoices_delete_admin_only"
  ON public.vendor_invoices FOR DELETE
  USING (
    tenant_id = (SELECT public.get_my_tenant_id())
    AND (SELECT public.is_tenant_admin())
  );

-- -----------------------------------------------------------------------------
-- SECTION 14: פוליסות RLS — טבלת contract_lines
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "contract_lines_select_own_tenant" ON public.contract_lines;
DROP POLICY IF EXISTS "contract_lines_insert_own_tenant" ON public.contract_lines;
DROP POLICY IF EXISTS "contract_lines_update_own_tenant" ON public.contract_lines;
DROP POLICY IF EXISTS "contract_lines_delete_own_tenant" ON public.contract_lines;

CREATE POLICY "contract_lines_select_own_tenant"
  ON public.contract_lines FOR SELECT
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "contract_lines_insert_own_tenant"
  ON public.contract_lines FOR INSERT
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "contract_lines_update_own_tenant"
  ON public.contract_lines FOR UPDATE
  USING     (tenant_id = (SELECT public.get_my_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "contract_lines_delete_own_tenant"
  ON public.contract_lines FOR DELETE
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

-- -----------------------------------------------------------------------------
-- SECTION 15: פוליסות RLS — טבלת purchase_order_lines
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "purchase_order_lines_select_own_tenant" ON public.purchase_order_lines;
DROP POLICY IF EXISTS "purchase_order_lines_insert_own_tenant" ON public.purchase_order_lines;
DROP POLICY IF EXISTS "purchase_order_lines_update_own_tenant" ON public.purchase_order_lines;
DROP POLICY IF EXISTS "purchase_order_lines_delete_own_tenant" ON public.purchase_order_lines;

CREATE POLICY "purchase_order_lines_select_own_tenant"
  ON public.purchase_order_lines FOR SELECT
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "purchase_order_lines_insert_own_tenant"
  ON public.purchase_order_lines FOR INSERT
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "purchase_order_lines_update_own_tenant"
  ON public.purchase_order_lines FOR UPDATE
  USING     (tenant_id = (SELECT public.get_my_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE POLICY "purchase_order_lines_delete_own_tenant"
  ON public.purchase_order_lines FOR DELETE
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

-- -----------------------------------------------------------------------------
-- SECTION 16: הגדרת הרשאות — ביטול anon, מתן הרשאות ל-authenticated
-- -----------------------------------------------------------------------------

REVOKE ALL ON public.tenants              FROM anon;
REVOKE ALL ON public.user_profiles        FROM anon;
REVOKE ALL ON public.projects             FROM anon;
REVOKE ALL ON public.contracts            FROM anon;
REVOKE ALL ON public.purchase_orders      FROM anon;
REVOKE ALL ON public.goods_receipts       FROM anon;
REVOKE ALL ON public.vendor_invoices      FROM anon;
REVOKE ALL ON public.contract_lines       FROM anon;
REVOKE ALL ON public.purchase_order_lines FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_receipts       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_invoices      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_lines       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_lines TO authenticated;

-- תיקון: חתימה מלאה עם טיפוסי החזרה לפי דרישת PostgreSQL
GRANT EXECUTE ON FUNCTION public.get_my_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin()   TO authenticated;

-- -----------------------------------------------------------------------------
-- SECTION 17: Trigger — הגדרת tenant_id אוטומטית בעת INSERT
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auto_set_tenant_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := public.get_my_tenant_id();
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required and could not be determined from the current session';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_set_tenant_id_projects             ON public.projects;
DROP TRIGGER IF EXISTS auto_set_tenant_id_contracts            ON public.contracts;
DROP TRIGGER IF EXISTS auto_set_tenant_id_purchase_orders      ON public.purchase_orders;
DROP TRIGGER IF EXISTS auto_set_tenant_id_goods_receipts       ON public.goods_receipts;
DROP TRIGGER IF EXISTS auto_set_tenant_id_vendor_invoices      ON public.vendor_invoices;
DROP TRIGGER IF EXISTS auto_set_tenant_id_contract_lines       ON public.contract_lines;
DROP TRIGGER IF EXISTS auto_set_tenant_id_purchase_order_lines ON public.purchase_order_lines;

CREATE TRIGGER auto_set_tenant_id_projects
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_tenant_id();

CREATE TRIGGER auto_set_tenant_id_contracts
  BEFORE INSERT ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_tenant_id();

CREATE TRIGGER auto_set_tenant_id_purchase_orders
  BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_tenant_id();

CREATE TRIGGER auto_set_tenant_id_goods_receipts
  BEFORE INSERT ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_tenant_id();

CREATE TRIGGER auto_set_tenant_id_vendor_invoices
  BEFORE INSERT ON public.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_tenant_id();

CREATE TRIGGER auto_set_tenant_id_contract_lines
  BEFORE INSERT ON public.contract_lines
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_tenant_id();

CREATE TRIGGER auto_set_tenant_id_purchase_order_lines
  BEFORE INSERT ON public.purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_tenant_id();

-- -----------------------------------------------------------------------------
-- SECTION 18: פונקציית יצירת user_profile אוטומטית בעת הרשמה
-- -----------------------------------------------------------------------------
-- הערה חשובה: ב-Supabase אין אפשרות להגדיר trigger על auth.users
--             ישירות במיגרציה ללא הרשאות מיוחדות.
--             יש להגדיר את הפונקציה הזו כ-Auth Hook דרך:
--             Supabase Dashboard > Authentication > Hooks > "After user created"
--             ולהצביע על הפונקציה: public.handle_new_auth_user
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id uuid;
  v_role      text;
BEGIN
  v_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::uuid;
  v_role      := COALESCE(NEW.raw_user_meta_data->>'role', 'member');

  IF v_role NOT IN ('tenant_admin', 'member', 'billing_manager', 'read_only', 'super_admin') THEN
    v_role := 'member';
  END IF;

  INSERT INTO public.user_profiles (id, email, full_name, tenant_id, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    v_tenant_id,
    v_role
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- הערה: השורות הבאות עלולות להיכשל בסביבות Supabase מסוימות ללא הרשאות מיוחדות.
--        אם נכשל — הסר את שתי השורות הבאות והגדר את ה-Hook דרך ה-Dashboard.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- =============================================================================
-- סוף Migration
-- =============================================================================
