-- =============================================================================
-- M6 — Building Onboarding & Modular Setup Wizard
-- =============================================================================
--
-- Delivers the database foundation for the "מסך הקמת בניין חכם" feature.
--
-- New artifacts:
--   1. erp_trigger_source ENUM extension  → 'onboarding_setup'
--   2. erp_set_updated_at()               → shared updated_at trigger helper
--   3. erp_onboarding_templates           → task catalog (seeded below, ~25 rows)
--   4. erp_onboarding_configs             → per-building contract configuration
--   5. erp_onboarding_task_instances      → generated setup tasks
--   6. ALTER erp_work_orders              → source_onboarding_task_id FK closure
--   7. RLS policies on all three tables
--   8. erp_seed_default_onboarding_templates() + call
-- =============================================================================

-- ── 1. ENUM EXTENSION ─────────────────────────────────────────────────────────
-- Required for C-Level CAPEX/OPEX cost separation:
--   WHERE trigger_source = 'onboarding_setup'  →  commissioning / CAPEX spend
--   WHERE trigger_source = 'human'             →  routine OPEX maintenance
ALTER TYPE public.erp_trigger_source ADD VALUE IF NOT EXISTS 'onboarding_setup';

-- ── 2. SHARED UPDATED-AT TRIGGER ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.erp_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── 3. erp_onboarding_templates ───────────────────────────────────────────────
--
-- System-global task catalog (company_id = NULL for MVP).
-- Seeded by erp_seed_default_onboarding_templates() at the end of this file.
--
-- MODULAR RULES:
--   A template is included when ALL of:
--     a) required_contract_types IS NULL  OR  contract_type = ANY(required_contract_types)
--     b) required_features IS NULL        OR  ALL(required_features) are enabled in features_config
--   Evaluation is done in JavaScript on the ~25 template rows — no heavy SQL ops needed.
-- ---------------------------------------------------------------------------

CREATE TABLE public.erp_onboarding_templates (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL = system-global.  Non-null = company-specific override (future).
  company_id                    text        NULL
    REFERENCES public.erp_companies(id) ON DELETE CASCADE,

  template_key                  text        NOT NULL
    CONSTRAINT erp_ot_key_nonempty CHECK (length(trim(template_key)) > 0),

  title                         text        NOT NULL
    CONSTRAINT erp_ot_title_nonempty CHECK (length(trim(title)) > 0),

  description                   text        NULL,

  phase                         text        NOT NULL DEFAULT 'setup'
    CONSTRAINT erp_ot_phase_chk CHECK (phase IN ('setup', 'commissioning', 'handover')),

  category                      public.erp_wo_category  NOT NULL,
  default_priority              public.ticket_priority  NOT NULL DEFAULT 'P3',

  -- Filter arrays: NULL = no restriction on this dimension
  required_contract_types       text[]      NULL,  -- e.g. ARRAY['full_maintenance','premium']
  required_features             text[]      NULL,  -- ALL must be ON in features_config

  -- Hint for UI supplier-assignment dropdown
  suggested_supplier_categories public.erp_wo_category[] NULL,

  estimated_days_to_complete    int         NOT NULL DEFAULT 7
    CONSTRAINT erp_ot_days_pos CHECK (estimated_days_to_complete > 0),

  display_order                 int         NOT NULL DEFAULT 0,
  is_mandatory                  boolean     NOT NULL DEFAULT false,
  is_active                     boolean     NOT NULL DEFAULT true,

  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),

  -- One template_key per scope (NULLs treated as equal → one global row per key)
  UNIQUE NULLS NOT DISTINCT (company_id, template_key)
);

CREATE TRIGGER erp_ot_updated_at
  BEFORE UPDATE ON public.erp_onboarding_templates
  FOR EACH ROW EXECUTE FUNCTION public.erp_set_updated_at();

CREATE INDEX erp_ot_contract_types_gin ON public.erp_onboarding_templates
  USING GIN (required_contract_types);
CREATE INDEX erp_ot_features_gin ON public.erp_onboarding_templates
  USING GIN (required_features);

-- ── 4. erp_onboarding_configs ─────────────────────────────────────────────────
--
-- One configuration per building per onboarding cycle.
-- Partial unique index → only one ACTIVE config per building at a time.
-- Historical completed/cancelled configs are retained for audit.
-- ---------------------------------------------------------------------------

CREATE TABLE public.erp_onboarding_configs (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              text        NOT NULL
    REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  building_id             uuid        NOT NULL
    REFERENCES public.buildings(id) ON DELETE RESTRICT,

  -- Commercial agreement type signed with ועד הדיירים
  contract_type           text        NOT NULL
    CONSTRAINT erp_oc_contract_type_chk CHECK (
      contract_type IN ('full_maintenance', 'basic_management', 'premium', 'custom')
    ),

  -- Feature-toggle map (JSON):
  -- {"smart_locks":true,"pump_monitoring":false,"gardening":true,
  --  "elevator_monitoring":true,"ev_charging":false,"cctv":true,
  --  "energy_metering":false,"pest_control":true,"cleaning":true,"iot_gateway":true}
  -- NOTE: iot_gateway is auto-coerced to true when any IoT feature is on (app layer)
  features_config         jsonb       NOT NULL DEFAULT '{}'::jsonb,

  status                  text        NOT NULL DEFAULT 'draft'
    CONSTRAINT erp_oc_status_chk CHECK (
      status IN ('draft', 'tasks_generated', 'in_progress', 'completed', 'cancelled')
    ),

  tasks_generated_at      timestamptz NULL,
  tasks_generated_by      uuid        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at            timestamptz NULL,
  completed_by            uuid        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Legal agreement metadata from the signed contract
  agreement_reference     text        NULL,
  agreement_signed_at     date        NULL,
  committee_contact_name  text        NULL,
  committee_contact_phone text        NULL,
  committee_contact_email text        NULL,
  notes                   text        NULL,

  created_by              uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Enforce: one active onboarding per building (multiple historical records allowed)
CREATE UNIQUE INDEX erp_oc_one_active_per_building
  ON public.erp_onboarding_configs (building_id)
  WHERE status NOT IN ('completed', 'cancelled');

CREATE TRIGGER erp_oc_updated_at
  BEFORE UPDATE ON public.erp_onboarding_configs
  FOR EACH ROW EXECUTE FUNCTION public.erp_set_updated_at();

CREATE INDEX erp_oc_company_status_idx ON public.erp_onboarding_configs (company_id, status);

-- ── 5. erp_onboarding_task_instances ──────────────────────────────────────────
--
-- Materialized setup tasks generated from the template catalog for one config.
-- UNIQUE (config_id, template_id) + ON CONFLICT DO NOTHING = idempotent generation.
-- Each instance eventually links to one erp_work_order once a supplier is assigned.
-- ---------------------------------------------------------------------------

CREATE TABLE public.erp_onboarding_task_instances (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              text        NOT NULL
    REFERENCES public.erp_companies(id) ON DELETE RESTRICT,
  config_id               uuid        NOT NULL
    REFERENCES public.erp_onboarding_configs(id) ON DELETE CASCADE,
  template_id             uuid        NOT NULL
    REFERENCES public.erp_onboarding_templates(id) ON DELETE RESTRICT,
  building_id             uuid        NOT NULL
    REFERENCES public.buildings(id) ON DELETE RESTRICT,

  -- Snapshot of template fields at generation time (survives future template edits)
  template_key            text        NOT NULL,
  title                   text        NOT NULL,   -- PM-editable
  description             text        NULL,
  phase                   text        NOT NULL
    CONSTRAINT erp_oti_phase_chk CHECK (phase IN ('setup', 'commissioning', 'handover')),
  category                public.erp_wo_category NOT NULL,
  priority                public.ticket_priority NOT NULL,
  display_order           int         NOT NULL DEFAULT 0,
  is_mandatory            boolean     NOT NULL DEFAULT false,

  -- Linked WO — set by assignOnboardingTask server action
  work_order_id           uuid        NULL REFERENCES public.erp_work_orders(id) ON DELETE SET NULL,
  assigned_to_supplier_id uuid        NULL REFERENCES public.erp_md_suppliers(id) ON DELETE SET NULL,
  assigned_at             timestamptz NULL,

  status                  text        NOT NULL DEFAULT 'pending'
    CONSTRAINT erp_oti_status_chk CHECK (
      status IN ('pending', 'assigned', 'in_progress', 'done', 'skipped')
    ),

  scheduled_start_date    date        NULL,
  scheduled_end_date      date        NULL,
  actual_completion_date  date        NULL,

  is_skipped              boolean     NOT NULL DEFAULT false,
  skip_reason             text        NULL,
  notes                   text        NULL,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- Idempotent generation constraint
  UNIQUE (config_id, template_id)
);

CREATE TRIGGER erp_oti_updated_at
  BEFORE UPDATE ON public.erp_onboarding_task_instances
  FOR EACH ROW EXECUTE FUNCTION public.erp_set_updated_at();

CREATE INDEX erp_oti_config_phase_idx  ON public.erp_onboarding_task_instances (config_id, phase);
CREATE INDEX erp_oti_building_idx      ON public.erp_onboarding_task_instances (building_id);
CREATE INDEX erp_oti_status_idx        ON public.erp_onboarding_task_instances (status);
CREATE INDEX erp_oti_work_order_idx    ON public.erp_onboarding_task_instances (work_order_id)
  WHERE work_order_id IS NOT NULL;

-- ── 6. BIDIRECTIONAL FK ON erp_work_orders ───────────────────────────────────
--
-- The CAPEX identifier: WHERE source_onboarding_task_id IS NOT NULL selects
-- every setup/commissioning WO across the entire portfolio.
-- Circular reference handled by creating instances first (above), then altering WOs.
-- ---------------------------------------------------------------------------

ALTER TABLE public.erp_work_orders
  ADD COLUMN IF NOT EXISTS source_onboarding_task_id uuid NULL
    REFERENCES public.erp_onboarding_task_instances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS erp_wo_onboarding_task_idx
  ON public.erp_work_orders (source_onboarding_task_id)
  WHERE source_onboarding_task_id IS NOT NULL;

-- ── 7. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.erp_onboarding_templates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_onboarding_configs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_onboarding_task_instances ENABLE ROW LEVEL SECURITY;

-- Templates: readable by all authenticated users; write = system admin only
CREATE POLICY "erp_ot_select_authenticated"
  ON public.erp_onboarding_templates FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "erp_ot_all_sysadmin"
  ON public.erp_onboarding_templates FOR ALL
  TO authenticated
  USING  (public.erp_is_system_admin())
  WITH CHECK (public.erp_is_system_admin());

-- Configs: company managers + system admin
CREATE POLICY "erp_oc_select"
  ON public.erp_onboarding_configs FOR SELECT
  TO authenticated
  USING (public.erp_can_manage_company(company_id) OR public.erp_is_system_admin());

CREATE POLICY "erp_oc_insert"
  ON public.erp_onboarding_configs FOR INSERT
  TO authenticated
  WITH CHECK (public.erp_can_manage_company(company_id) OR public.erp_is_system_admin());

CREATE POLICY "erp_oc_update"
  ON public.erp_onboarding_configs FOR UPDATE
  TO authenticated
  USING  (public.erp_can_manage_company(company_id) OR public.erp_is_system_admin())
  WITH CHECK (public.erp_can_manage_company(company_id) OR public.erp_is_system_admin());

CREATE POLICY "erp_oc_delete_sysadmin"
  ON public.erp_onboarding_configs FOR DELETE
  TO authenticated USING (public.erp_is_system_admin());

-- Task instances: company managers + system admin
CREATE POLICY "erp_oti_select"
  ON public.erp_onboarding_task_instances FOR SELECT
  TO authenticated
  USING (public.erp_can_manage_company(company_id) OR public.erp_is_system_admin());

CREATE POLICY "erp_oti_insert"
  ON public.erp_onboarding_task_instances FOR INSERT
  TO authenticated
  WITH CHECK (public.erp_can_manage_company(company_id) OR public.erp_is_system_admin());

CREATE POLICY "erp_oti_update"
  ON public.erp_onboarding_task_instances FOR UPDATE
  TO authenticated
  USING  (public.erp_can_manage_company(company_id) OR public.erp_is_system_admin())
  WITH CHECK (public.erp_can_manage_company(company_id) OR public.erp_is_system_admin());

CREATE POLICY "erp_oti_delete_sysadmin"
  ON public.erp_onboarding_task_instances FOR DELETE
  TO authenticated USING (public.erp_is_system_admin());

-- ── 8. SEED FUNCTION ─────────────────────────────────────────────────────────
--
-- Seeds the 25 system-global onboarding templates.
-- Idempotent via ON CONFLICT (company_id, template_key) DO NOTHING.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.erp_seed_default_onboarding_templates()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.erp_onboarding_templates (
    company_id, template_key, title, description,
    phase, category, default_priority,
    required_contract_types, required_features,
    suggested_supplier_categories,
    estimated_days_to_complete, display_order, is_mandatory
  ) VALUES

  -- ══════════════════════════════════════════════════════════════════════════
  -- PHASE: SETUP (12 tasks) — התקנה פיזית
  -- ══════════════════════════════════════════════════════════════════════════

  (NULL, 'base_cmms_activation',
   'הפעלת מודול ניהול תחזוקה (CMMS)',
   'הגדרת מבנה הבניין במערכת, יצירת פרופיל נכס, הגדרת קטגוריות תחזוקה ראשוניות.',
   'setup', 'general', 'P2',
   NULL, NULL, ARRAY['general']::public.erp_wo_category[], 2, 10, true),

  (NULL, 'sla_contracts_setup',
   'הגדרת חוזי SLA עם קבלני המשנה',
   'קביעת זמני תגובה ופתרון, הגדרת קנסות, הקצאת ספקים לכל קטגוריה.',
   'setup', 'general', 'P2',
   NULL, NULL, ARRAY['general']::public.erp_wo_category[], 3, 20, true),

  (NULL, 'iot_gateway_installation',
   'התקנת ה-IoT Gateway המרכזי',
   'התקנה פיזית של Gateway בחדר הטכני, חיבור LAN/PoE, אימות פינג ראשוני.',
   'setup', 'iot_device', 'P1',
   ARRAY['full_maintenance','premium'], ARRAY['iot_gateway'],
   ARRAY['iot_device']::public.erp_wo_category[], 2, 30, true),

  (NULL, 'network_provisioning',
   'הכנת תשתית רשת לחיישנים (Cabling & PoE)',
   'הנחת כבלי UTP/PoE לנקודות ההתקנה של חיישנים ומצלמות.',
   'setup', 'electrical', 'P2',
   ARRAY['full_maintenance','premium'], ARRAY['iot_gateway'],
   ARRAY['electrical']::public.erp_wo_category[], 3, 40, false),

  (NULL, 'smart_locks_hw_install',
   'התקנת מנעולים חכמים על כל הקומות',
   'הרכבה פיזית של מנעולים (Salto/ButterflyMX) על דלתות כניסה לקומות.',
   'setup', 'security_access', 'P1',
   ARRAY['full_maintenance','premium'], ARRAY['smart_locks'],
   ARRAY['security_access']::public.erp_wo_category[], 5, 50, true),

  (NULL, 'cctv_camera_mounting',
   'הרכבת מצלמות אבטחה (CCTV/IP)',
   'מיקום ותלייה של מצלמות IP בלובי, מסדרונות, חניון ונקודות כניסה.',
   'setup', 'security_access', 'P2',
   ARRAY['full_maintenance','basic_management','premium'], ARRAY['cctv'],
   ARRAY['security_access']::public.erp_wo_category[], 5, 60, true),

  (NULL, 'pump_sensor_install',
   'התקנת חיישני ניטור משאבות (IoT)',
   'הצמדת חיישני רטט/טמפרטורה על משאבות המים הראשיות.',
   'setup', 'hvac', 'P2',
   ARRAY['full_maintenance','premium'], ARRAY['pump_monitoring'],
   ARRAY['hvac']::public.erp_wo_category[], 3, 70, true),

  (NULL, 'elevator_sensor_install',
   'התקנת חיישני ניטור מעלית (IoT)',
   'התקנת חיישני תאוצה/מצב דלת על תאי המעלית.',
   'setup', 'elevator', 'P2',
   ARRAY['full_maintenance','premium'], ARRAY['elevator_monitoring'],
   ARRAY['elevator']::public.erp_wo_category[], 2, 80, true),

  (NULL, 'ev_charger_unit_install',
   'התקנת עמדות טעינה לרכב חשמלי (EV)',
   'התקנת יחידות EV Charger בחניון, חיבור לחשמל, בדיקת ממשק ניהול.',
   'setup', 'electrical', 'P2',
   ARRAY['premium'], ARRAY['ev_charging'],
   ARRAY['electrical']::public.erp_wo_category[], 7, 90, true),

  (NULL, 'energy_meter_install',
   'התקנת מונה חשמל חכם (Smart Meter)',
   'החלפת מד חשמל ישן במונה IoT/AMI, בדיקת שידור נתונים לענן.',
   'setup', 'electrical', 'P2',
   ARRAY['premium'], ARRAY['energy_metering'],
   ARRAY['electrical']::public.erp_wo_category[], 3, 100, true),

  (NULL, 'cleaning_schedule_setup',
   'הגדרת לוח זמנים לניקיון שוטף',
   'קביעת תדירות, הקצאת ספק ניקיון, הזנת פרמטרים לתחזוקה מונעת.',
   'setup', 'cleaning', 'P3',
   NULL, ARRAY['cleaning'],
   ARRAY['cleaning']::public.erp_wo_category[], 1, 110, false),

  (NULL, 'pest_control_schedule_setup',
   'הגדרת לוח זמנים להדברה',
   'קביעת תדירות הדברה, הקצאת ספק, הזנה לתוכנית תחזוקה מונעת.',
   'setup', 'general', 'P3',
   NULL, ARRAY['pest_control'],
   ARRAY['general']::public.erp_wo_category[], 1, 120, false),

  -- ══════════════════════════════════════════════════════════════════════════
  -- PHASE: COMMISSIONING (9 tasks) — קומיסיונינג ובדיקות
  -- ══════════════════════════════════════════════════════════════════════════

  (NULL, 'iot_gateway_pairing',
   'רישום Gateway ב-Supabase + בדיקת HMAC Webhook',
   'הזנת MAC ו-gateway_id ב-erp_physical_assets. אימות חתימת HMAC.',
   'commissioning', 'iot_device', 'P1',
   NULL, ARRAY['iot_gateway'],
   ARRAY['iot_device']::public.erp_wo_category[], 1, 130, true),

  (NULL, 'smart_locks_provisioning',
   'פרוביזיונינג מנעולים חכמים + מחזור בדיקה מלא',
   'רישום מנעולים בממשק Salto/ButterflyMX, בדיקת פתיחה/נעילה מרחוק.',
   'commissioning', 'security_access', 'P1',
   NULL, ARRAY['smart_locks'],
   ARRAY['security_access']::public.erp_wo_category[], 2, 140, true),

  (NULL, 'cctv_onvif_config',
   'הגדרת חיבור ONVIF למצלמות + בדיקת זרם וידאו',
   'הגדרת IP סטטי, ONVIF/RTSP, בדיקת זרם חי ב-VMS.',
   'commissioning', 'security_access', 'P2',
   NULL, ARRAY['cctv'],
   ARRAY['security_access']::public.erp_wo_category[], 1, 150, true),

  (NULL, 'pump_baseline_calibration',
   'כיול קו הבסיס לניטור רטט משאבות',
   'הגדרת baseline_vibration_hz ו-alert_threshold_pct ב-hardware_meta.',
   'commissioning', 'hvac', 'P2',
   NULL, ARRAY['pump_monitoring'],
   ARRAY['hvac']::public.erp_wo_category[], 1, 160, true),

  (NULL, 'elevator_sensor_pairing',
   'בדיקת חיישני מעלית + הגדרת סף התראה',
   'בדיקת שידור נתוני תאוצה ומצב דלת, הגדרת ערכי סף.',
   'commissioning', 'elevator', 'P2',
   NULL, ARRAY['elevator_monitoring'],
   ARRAY['elevator']::public.erp_wo_category[], 1, 170, true),

  (NULL, 'asset_db_provisioning',
   'רישום כל הנכסים הפיזיים במערכת (erp_physical_assets)',
   'הזנת כל ציוד הבניין: מעליות, משאבות, לוחות חשמל, מנעולים.',
   'commissioning', 'iot_device', 'P2',
   ARRAY['full_maintenance','premium'], NULL,
   ARRAY['iot_device']::public.erp_wo_category[], 3, 180, true),

  (NULL, 'sla_activation_test',
   'אימות מנגנון SLA — פתיחת פקודת עבודה לבדיקה',
   'פתיחת פקודת עבודה מבחן, אימות חישוב תאריכי יעד SLA.',
   'commissioning', 'general', 'P2',
   NULL, NULL, ARRAY['general']::public.erp_wo_category[], 1, 190, true),

  (NULL, 'iot_rules_activation',
   'הפעלת כללי מנוע IoT (erp_iot_rules) + בדיקת קורלציה',
   'הפעלת כללי ברירת מחדל (TAILGATE, DOOR_FORCED, VIBRATION), בדיקה end-to-end.',
   'commissioning', 'iot_device', 'P2',
   NULL, ARRAY['iot_gateway'],
   ARRAY['iot_device']::public.erp_wo_category[], 1, 200, false),

  (NULL, 'committee_demo_session',
   'הדגמת המערכת לנציגי ועד הדיירים',
   'הצגת פורטל ועד, מעקב תקלות, לוח בקרה בזמן אמת.',
   'commissioning', 'general', 'P3',
   NULL, NULL, ARRAY['general']::public.erp_wo_category[], 1, 210, false),

  -- ══════════════════════════════════════════════════════════════════════════
  -- PHASE: HANDOVER (4 tasks) — מסירה וחתימות
  -- ══════════════════════════════════════════════════════════════════════════

  (NULL, 'pm_sign_off',
   'חתימת מנהל הנכסים על השלמת ההקמה',
   'סיכום פקודות עבודה שנסגרו. חתימה על פרוטוקול מסירה פנימי.',
   'handover', 'general', 'P2',
   NULL, NULL, ARRAY['general']::public.erp_wo_category[], 1, 220, true),

  (NULL, 'committee_chairman_sign_off',
   'חתימת יו"ר ועד דיירים על קבלת המבנה',
   'פגישת מסירה רשמית עם יו"ר הועד, חתימה על פרוטוקול קבלה.',
   'handover', 'general', 'P2',
   NULL, NULL, ARRAY['general']::public.erp_wo_category[], 1, 230, true),

  (NULL, 'punch_list_closure',
   'סגירת רשימת ליקויים (Punch List)',
   'סיכום ותיעוד כל הליקויים שנמצאו בתהליך ההקמה ואישור תיקונם.',
   'handover', 'general', 'P3',
   NULL, NULL, ARRAY['general']::public.erp_wo_category[], 3, 240, false),

  (NULL, 'preventive_plans_activation',
   'הפעלת תוכניות תחזוקה מונעת ראשונות',
   'יצירת erp_preventive_plans לציוד קריטי: מעלית (חודשי), משאבות (רבעוני).',
   'handover', 'general', 'P3',
   NULL, NULL, ARRAY['general']::public.erp_wo_category[], 1, 250, true)

  ON CONFLICT (company_id, template_key) DO NOTHING;

  RAISE NOTICE 'erp_seed_default_onboarding_templates: % templates seeded (ON CONFLICT DO NOTHING).',
    (SELECT count(*) FROM public.erp_onboarding_templates WHERE company_id IS NULL);
END;
$$;

-- ── 9. CALL SEED ─────────────────────────────────────────────────────────────
SELECT public.erp_seed_default_onboarding_templates();
