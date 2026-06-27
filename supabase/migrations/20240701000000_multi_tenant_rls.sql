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
  slug        TEXT        NOT NULL UNIQUE,  -- מזהה ידידותי לשימוש ב-URL
  status      TEXT        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'suspended', 'cancelled', 'trial')),
  plan        TEXT        NOT NULL DEFAULT 'trial'
                          CHECK (plan IN ('trial', 'basic', 'pro', 'enterprise')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenants IS 'כל שורה מייצגת לקוח/חברה אחת במערכת ה-SaaS';
COMMENT ON COLUMN public.tenants.slug IS 'מזהה ייחודי ידידותי לשימוש ב-URL, לדוגמה: marker-ofek';
COMMENT ON COLUMN public.tenants.status IS 'מצב הטנאנט: active, suspended, cancelled, trial';
COMMENT ON COLUMN public.tenants.plan IS 'תוכנית המנוי: trial, basic, pro, enterprise';

-- Trigger לעדכון אוטומטי של updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
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
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL DEFAULT 'member'
                          CHECK (role IN (
                            'tenant_admin',   -- מנהל החברה
                            'member',         -- עובד רגיל
                            'billing_manager',-- מנהל כספים
                            'read_only',      -- צפייה בלבד
                            'super_admin'     -- צוות ה-SaaS בלבד
                          )),
  full_name   TEXT,
  email       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_profiles IS 'פרופיל משתמש המקשר בין auth.users לטנאנט ולתפקיד';
COMMENT ON COLUMN public.user_profiles.role IS 'תפקיד המשתמש בתוך הטנאנט שלו';

CREATE TRIGGER user_profiles_set_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- אינדקס לחיפוש מהיר לפי tenant_id
CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant_id
  ON public.user_profiles(tenant_id);

-- -----------------------------------------------------------------------------
-- SECTION 3: פונקציית עזר — חילוץ tenant_id של המשתמש המחובר
-- -----------------------------------------------------------------------------
-- פונקציה זו תשמש את כל פוליסות ה-RLS.
-- היא מחזירה את ה-tenant_id של המשתמש הנוכחי מתוך טבלת user_profiles.
-- SECURITY DEFINER מאפשר לה לרוץ עם הרשאות המגדיר (לא המשתמש),
-- כדי לקרוא מ-user_profiles גם כשה-RLS על אותה טבלה פעיל.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
  FROM public.user_profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_my_tenant_id() IS
  'מחזירה את tenant_id של המשתמש המחובר כרגע. משמשת את פוליסות ה-RLS.';

-- פונקציית עזר לבדיקת תפקיד המשתמש
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_my_role() IS
  'מחזירה את התפקיד של המשתמש המחובר כרגע.';

-- פונקציית עזר — האם המשתמש הוא tenant_admin או super_admin?
CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = auth.uid()
      AND role IN ('tenant_admin', 'super_admin')
  );
$$;

-- -----------------------------------------------------------------------------
-- SECTION 4: הוספת עמודת tenant_id לטבלאות הליבה
-- -----------------------------------------------------------------------------
-- הערה: אנו משתמשים ב-ADD COLUMN IF NOT EXISTS כדי שה-migration יהיה idempotent.
-- הערה: NOT NULL נאכף רק לאחר מילוי הנתונים הקיימים (ראה SECTION 4b).
-- -----------------------------------------------------------------------------

-- 4a: הוספת העמודה כ-NULLABLE תחילה (לטיפול בנתונים קיימים)

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE RESTRICT;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE RESTRICT;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE RESTRICT;

ALTER TABLE public.goods_receipts
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE RESTRICT;

ALTER TABLE public.vendor_invoices
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE RESTRICT;

ALTER TABLE public.contract_lines
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE RESTRICT;

ALTER TABLE public.purchase_order_lines
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE RESTRICT;

-- -----------------------------------------------------------------------------
-- SECTION 4b: יצירת טנאנט ברירת מחדל לנתונים קיימים (Marker Ofek)
-- -----------------------------------------------------------------------------
-- חשוב: בסביבת production יש להחליף את הערכים הבאים בערכים אמיתיים.
-- הבלוק DO מאפשר לנו להשתמש ב-PL/pgSQL בתוך migration.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_default_tenant_id UUID;
BEGIN
  -- יצירת טנאנט ברירת מחדל עבור הנתונים הקיימים
  INSERT INTO public.tenants (id, name, slug, status, plan)
  VALUES (
    gen_random_uuid(),
    'Marker Ofek',
    'marker-ofek',
    'active',
    'enterprise'
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_default_tenant_id;

  -- אם הטנאנט כבר קיים, נחלץ את ה-id שלו
  IF v_default_tenant_id IS NULL THEN
    SELECT id INTO v_default_tenant_id
    FROM public.tenants
    WHERE slug = 'marker-ofek';
  END IF;

  -- עדכון כל הנתונים הקיימים עם ה-tenant_id של Marker Ofek
  UPDATE public.projects        SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.contracts       SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.purchase_orders SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.goods_receipts  SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.vendor_invoices SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.contract_lines  SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.purchase_order_lines SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;

  RAISE NOTICE 'Default tenant created/found with id: %', v_default_tenant_id;
END;
$$;

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
-- SECTION 6: הפעלת Row Level Security על כל הטבלאות
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
-- משתמש יכול לראות רק את הטנאנט שלו.
-- רק super_admin יכול ליצור/לעדכן/למחוק טנאנטים.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "tenants_select_own" ON public.tenants;
CREATE POLICY "tenants_select_own"
  ON public.tenants
  FOR SELECT
  USING (id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "tenants_insert_super_admin" ON public.tenants;
CREATE POLICY "tenants_insert_super_admin"
  ON public.tenants
  FOR INSERT
  WITH CHECK (public.get_my_role() = 'super_admin');

DROP POLICY IF EXISTS "tenants_update_super_admin" ON public.tenants;
CREATE POLICY "tenants_update_super_admin"
  ON public.tenants
  FOR UPDATE
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');

DROP POLICY IF EXISTS "tenants_delete_super_admin" ON public.tenants;
CREATE POLICY "tenants_delete_super_admin"
  ON public.tenants
  FOR DELETE
  USING (public.get_my_role() = 'super_admin');

-- -----------------------------------------------------------------------------
-- SECTION 8: פוליסות RLS — טבלת user_profiles
-- -----------------------------------------------------------------------------
-- משתמש יכול לראות פרופילים של אנשים באותו טנאנט.
-- רק tenant_admin יכול להוסיף/לעדכן/למחוק משתמשים בטנאנט שלו.
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "user_profiles_select_same_tenant" ON public.user_profiles;
CREATE POLICY "user_profiles_select_same_tenant"
  ON public.user_profiles
  FOR SELECT
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "user_profiles_insert_admin" ON public.user_profiles;
CREATE POLICY "user_profiles_insert_admin"
  ON public.user_profiles
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_my_tenant_id()
    AND public.is_tenant_admin()
  );

DROP POLICY IF EXISTS "user_profiles_update_admin_or_self" ON public.user_profiles;
CREATE POLICY "user_profiles_update_admin_or_self"
  ON public.user_profiles
  FOR UPDATE
  USING (
    tenant_id = public.get_my_tenant_id()
    AND (id = auth.uid() OR public.is_tenant_admin())
  )
  WITH CHECK (
    tenant_id = public.get_my_tenant_id()
    AND (id = auth.uid() OR public.is_tenant_admin())
  );

DROP POLICY IF EXISTS "user_profiles_delete_admin" ON public.user_profiles;
CREATE POLICY "user_profiles_delete_admin"
  ON public.user_profiles
  FOR DELETE
  USING (
    tenant_id = public.get_my_tenant_id()
    AND public.is_tenant_admin()
    AND id != auth.uid()  -- מנהל לא יכול למחוק את עצמו
  );

-- -----------------------------------------------------------------------------
-- SECTION 9: פוליסות RLS — טבלת projects
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "projects_select_own_tenant" ON public.projects;
CREATE POLICY "projects_select_own_tenant"
  ON public.projects
  FOR SELECT
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "projects_insert_own_tenant" ON public.projects;
CREATE POLICY "projects_insert_own_tenant"
  ON public.projects
  FOR INSERT
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "projects_update_own_tenant" ON public.projects;
CREATE POLICY "projects_update_own_tenant"
  ON public.projects
  FOR UPDATE
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "projects_delete_admin_only" ON public.projects;
CREATE POLICY "projects_delete_admin_only"
  ON public.projects
  FOR DELETE
  USING (
    tenant_id = public.get_my_tenant_id()
    AND public.is_tenant_admin()
  );

-- -----------------------------------------------------------------------------
-- SECTION 10: פוליסות RLS — טבלת contracts
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "contracts_select_own_tenant" ON public.contracts;
CREATE POLICY "contracts_select_own_tenant"
  ON public.contracts
  FOR SELECT
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "contracts_insert_own_tenant" ON public.contracts;
CREATE POLICY "contracts_insert_own_tenant"
  ON public.contracts
  FOR INSERT
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "contracts_update_own_tenant" ON public.contracts;
CREATE POLICY "contracts_update_own_tenant"
  ON public.contracts
  FOR UPDATE
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "contracts_delete_admin_only" ON public.contracts;
CREATE POLICY "contracts_delete_admin_only"
  ON public.contracts
  FOR DELETE
  USING (
    tenant_id = public.get_my_tenant_id()
    AND public.is_tenant_admin()
  );

-- -----------------------------------------------------------------------------
-- SECTION 11: פוליסות RLS — טבלת purchase_orders
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "purchase_orders_select_own_tenant" ON public.purchase_orders;
CREATE POLICY "purchase_orders_select_own_tenant"
  ON public.purchase_orders
  FOR SELECT
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "purchase_orders_insert_own_tenant" ON public.purchase_orders;
CREATE POLICY "purchase_orders_insert_own_tenant"
  ON public.purchase_orders
  FOR INSERT
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "purchase_orders_update_own_tenant" ON public.purchase_orders;
CREATE POLICY "purchase_orders_update_own_tenant"
  ON public.purchase_orders
  FOR UPDATE
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "purchase_orders_delete_admin_only" ON public.purchase_orders;
CREATE POLICY "purchase_orders_delete_admin_only"
  ON public.purchase_orders
  FOR DELETE
  USING (
    tenant_id = public.get_my_tenant_id()
    AND public.is_tenant_admin()
  );

-- -----------------------------------------------------------------------------
-- SECTION 12: פוליסות RLS — טבלת goods_receipts
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "goods_receipts_select_own_tenant" ON public.goods_receipts;
CREATE POLICY "goods_receipts_select_own_tenant"
  ON public.goods_receipts
  FOR SELECT
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "goods_receipts_insert_own_tenant" ON public.goods_receipts;
CREATE POLICY "goods_receipts_insert_own_tenant"
  ON public.goods_receipts
  FOR INSERT
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "goods_receipts_update_own_tenant" ON public.goods_receipts;
CREATE POLICY "goods_receipts_update_own_tenant"
  ON public.goods_receipts
  FOR UPDATE
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "goods_receipts_delete_admin_only" ON public.goods_receipts;
CREATE POLICY "goods_receipts_delete_admin_only"
  ON public.goods_receipts
  FOR DELETE
  USING (
    tenant_id = public.get_my_tenant_id()
    AND public.is_tenant_admin()
  );

-- -----------------------------------------------------------------------------
-- SECTION 13: פוליסות RLS — טבלת vendor_invoices
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "vendor_invoices_select_own_tenant" ON public.vendor_invoices;
CREATE POLICY "vendor_invoices_select_own_tenant"
  ON public.vendor_invoices
  FOR SELECT
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "vendor_invoices_insert_own_tenant" ON public.vendor_invoices;
CREATE POLICY "vendor_invoices_insert_own_tenant"
  ON public.vendor_invoices
  FOR INSERT
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "vendor_invoices_update_own_tenant" ON public.vendor_invoices;
CREATE POLICY "vendor_invoices_update_own_tenant"
  ON public.vendor_invoices
  FOR UPDATE
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "vendor_invoices_delete_admin_only" ON public.vendor_invoices;
CREATE POLICY "vendor_invoices_delete_admin_only"
  ON public.vendor_invoices
  FOR DELETE
  USING (
    tenant_id = public.get_my_tenant_id()
    AND public.is_tenant_admin()
  );

-- -----------------------------------------------------------------------------
-- SECTION 14: פוליסות RLS — טבלת contract_lines
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "contract_lines_select_own_tenant" ON public.contract_lines;
CREATE POLICY "contract_lines_select_own_tenant"
  ON public.contract_lines
  FOR SELECT
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "contract_lines_insert_own_tenant" ON public.contract_lines;
CREATE POLICY "contract_lines_insert_own_tenant"
  ON public.contract_lines
  FOR INSERT
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "contract_lines_update_own_tenant" ON public.contract_lines;
CREATE POLICY "contract_lines_update_own_tenant"
  ON public.contract_lines
  FOR UPDATE
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "contract_lines_delete_own_tenant" ON public.contract_lines;
CREATE POLICY "contract_lines_delete_own_tenant"
  ON public.contract_lines
  FOR DELETE
  USING (tenant_id = public.get_my_tenant_id());

-- -----------------------------------------------------------------------------
-- SECTION 15: פוליסות RLS — טבלת purchase_order_lines
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "purchase_order_lines_select_own_tenant" ON public.purchase_order_lines;
CREATE POLICY "purchase_order_lines_select_own_tenant"
  ON public.purchase_order_lines
  FOR SELECT
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "purchase_order_lines_insert_own_tenant" ON public.purchase_order_lines;
CREATE POLICY "purchase_order_lines_insert_own_tenant"
  ON public.purchase_order_lines
  FOR INSERT
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "purchase_order_lines_update_own_tenant" ON public.purchase_order_lines;
CREATE POLICY "purchase_order_lines_update_own_tenant"
  ON public.purchase_order_lines
  FOR UPDATE
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "purchase_order_lines_delete_own_tenant" ON public.purchase_order_lines;
CREATE POLICY "purchase_order_lines_delete_own_tenant"
  ON public.purchase_order_lines
  FOR DELETE
  USING (tenant_id = public.get_my_tenant_id());

-- -----------------------------------------------------------------------------
-- SECTION 16: הגדרת Service Role Bypass
-- -----------------------------------------------------------------------------
-- ה-service_role של Supabase עוקף RLS באופן אוטומטי.
-- אנו מוסיפים פוליסת bypass מפורשת ל-anon role כדי לחסום גישה ישירה.
-- הערה: ה-service_role key חייב להישמר בצד השרת בלבד (env variables).
-- -----------------------------------------------------------------------------

-- ביטול גישת anon לטבלאות הרגישות (ברירת מחדל של Supabase נותנת גישה ל-anon)
REVOKE ALL ON public.tenants              FROM anon;
REVOKE ALL ON public.user_profiles        FROM anon;
REVOKE ALL ON public.projects             FROM anon;
REVOKE ALL ON public.contracts            FROM anon;
REVOKE ALL ON public.purchase_orders      FROM anon;
REVOKE ALL ON public.goods_receipts       FROM anon;
REVOKE ALL ON public.vendor_invoices      FROM anon;
REVOKE ALL ON public.contract_lines       FROM anon;
REVOKE ALL ON public.purchase_order_lines FROM anon;

-- מתן הרשאות מינימליות ל-authenticated role (RLS יאכף את הבידוד)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_receipts       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_invoices      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_lines       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_lines TO authenticated;

-- הרשאות על הפונקציות
GRANT EXECUTE ON FUNCTION public.get_my_tenant_id()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin()    TO authenticated;

-- -----------------------------------------------------------------------------
-- SECTION 17: Trigger אוטומטי — הגדרת tenant_id בעת INSERT
-- -----------------------------------------------------------------------------
-- Trigger זה מבטיח שכל INSERT חדש יקבל אוטומטית את ה-tenant_id
-- של המשתמש המחובר, גם אם הקוד שכח לציין אותו.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auto_set_tenant_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- אם tenant_id לא סופק, נגזור אותו מהמשתמש המחובר
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := public.get_my_tenant_id();
  END IF;

  -- אם עדיין NULL (משתמש לא מחובר), נחסום את הפעולה
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required and could not be determined from the current session';
  END IF;

  RETURN NEW;
END;
$$;

-- יצירת ה-Triggers על כל הטבלאות
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
-- SECTION 18: Trigger אוטומטי — יצירת user_profile בעת הרשמה
-- -----------------------------------------------------------------------------
-- כאשר משתמש חדש נרשם ב-Supabase Auth, נוצר אוטומטית פרופיל בסיסי.
-- הטנאנט יוגדר בשלב ה-Onboarding.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- יצירת פרופיל בסיסי — tenant_id יוגדר בתהליך ה-Onboarding
  -- לכן אנו מאפשרים NULL זמנית (הטבלה תעודכן לאחר מכן)
  INSERT INTO public.user_profiles (id, email, full_name, tenant_id, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    (NEW.raw_user_meta_data->>'tenant_id')::UUID,  -- מגיע מה-metadata בעת הרשמה
    COALESCE(NEW.raw_user_meta_data->>'role', 'member')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- הפעלת ה-Trigger על טבלת auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- SECTION 19: תיעוד סיכום
-- -----------------------------------------------------------------------------

COMMENT ON POLICY "projects_select_own_tenant"    ON public.projects IS 'משתמש רואה רק פרויקטים של הטנאנט שלו';
COMMENT ON POLICY "contracts_select_own_tenant"   ON public.contracts IS 'משתמש רואה רק חוזים של הטנאנט שלו';
COMMENT ON POLICY "purchase_orders_select_own_tenant" ON public.purchase_orders IS 'משתמש רואה רק הזמנות רכש של הטנאנט שלו';
COMMENT ON POLICY "goods_receipts_select_own_tenant"  ON public.goods_receipts IS 'משתמש רואה רק תעודות משלוח של הטנאנט שלו';
COMMENT ON POLICY "vendor_invoices_select_own_tenant" ON public.vendor_invoices IS 'משתמש רואה רק חשבוניות ספקים של הטנאנט שלו';

-- =============================================================================
-- סוף Migration
-- =============================================================================
