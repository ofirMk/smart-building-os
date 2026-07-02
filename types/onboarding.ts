/**
 * Onboarding Module — TypeScript interfaces
 *
 * Covers the three DB tables introduced in M6:
 *   erp_onboarding_templates, erp_onboarding_configs, erp_onboarding_task_instances
 *
 * Also exports the CONTRACT_TYPE_DEFAULTS map used by AgreementConfigurator
 * to auto-populate feature toggles when the user picks a contract type.
 */

import type { ErpWoCategory, TicketPriority } from '@/types/iot'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Enum / union type mirrors
// ─────────────────────────────────────────────────────────────────────────────

export type ContractType =
  | 'full_maintenance'
  | 'basic_management'
  | 'premium'
  | 'custom'

export type OnboardingPhase = 'setup' | 'commissioning' | 'handover'

export type OnboardingStatus =
  | 'draft'
  | 'tasks_generated'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type TaskStatus =
  | 'pending'
  | 'assigned'
  | 'in_progress'
  | 'done'
  | 'skipped'

/** All toggleable feature keys stored in features_config JSONB */
export type OnboardingFeature =
  | 'smart_locks'
  | 'pump_monitoring'
  | 'gardening'
  | 'elevator_monitoring'
  | 'ev_charging'
  | 'cctv'
  | 'energy_metering'
  | 'pest_control'
  | 'cleaning'
  | 'iot_gateway'

/** The full features_config JSON shape */
export type FeaturesConfig = Record<OnboardingFeature, boolean>

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — DB row interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface ErpOnboardingTemplate {
  id: string
  company_id: string | null
  template_key: string
  title: string
  description: string | null
  phase: OnboardingPhase
  category: ErpWoCategory
  default_priority: TicketPriority
  required_contract_types: ContractType[] | null
  required_features: OnboardingFeature[] | null
  suggested_supplier_categories: ErpWoCategory[] | null
  estimated_days_to_complete: number
  display_order: number
  is_mandatory: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ErpOnboardingConfig {
  id: string
  company_id: string
  building_id: string
  contract_type: ContractType
  features_config: FeaturesConfig
  status: OnboardingStatus
  tasks_generated_at: string | null
  tasks_generated_by: string | null
  completed_at: string | null
  completed_by: string | null
  agreement_reference: string | null
  agreement_signed_at: string | null      // ISO date
  committee_contact_name: string | null
  committee_contact_phone: string | null
  committee_contact_email: string | null
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface ErpOnboardingTaskInstance {
  id: string
  company_id: string
  config_id: string
  template_id: string
  building_id: string
  template_key: string
  title: string
  description: string | null
  phase: OnboardingPhase
  category: ErpWoCategory
  priority: TicketPriority
  display_order: number
  is_mandatory: boolean
  work_order_id: string | null
  assigned_to_supplier_id: string | null
  assigned_at: string | null
  status: TaskStatus
  scheduled_start_date: string | null     // ISO date
  scheduled_end_date: string | null       // ISO date
  actual_completion_date: string | null   // ISO date
  is_skipped: boolean
  skip_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Contract type × feature defaults matrix
// Used by AgreementConfigurator to auto-populate toggles on type selection.
// ─────────────────────────────────────────────────────────────────────────────

export const EMPTY_FEATURES: FeaturesConfig = {
  smart_locks: false,
  pump_monitoring: false,
  gardening: false,
  elevator_monitoring: false,
  ev_charging: false,
  cctv: false,
  energy_metering: false,
  pest_control: false,
  cleaning: false,
  iot_gateway: false,
}

export const CONTRACT_TYPE_DEFAULTS: Record<ContractType, FeaturesConfig> = {
  full_maintenance: {
    smart_locks: true,
    pump_monitoring: true,
    gardening: true,
    elevator_monitoring: true,
    ev_charging: false,
    cctv: true,
    energy_metering: false,
    pest_control: true,
    cleaning: true,
    iot_gateway: true,
  },
  basic_management: {
    smart_locks: false,
    pump_monitoring: false,
    gardening: false,
    elevator_monitoring: false,
    ev_charging: false,
    cctv: true,
    energy_metering: false,
    pest_control: true,
    cleaning: true,
    iot_gateway: false,
  },
  premium: {
    smart_locks: true,
    pump_monitoring: true,
    gardening: true,
    elevator_monitoring: true,
    ev_charging: true,
    cctv: true,
    energy_metering: true,
    pest_control: true,
    cleaning: true,
    iot_gateway: true,
  },
  custom: { ...EMPTY_FEATURES },
}

/** Features that require iot_gateway to be ON when they are enabled */
export const IOT_DEPENDENT_FEATURES: OnboardingFeature[] = [
  'smart_locks',
  'pump_monitoring',
  'elevator_monitoring',
  'cctv',
]

/**
 * Applies the iot_gateway auto-coercion rule:
 * if any IoT-dependent feature is ON → force iot_gateway ON.
 */
export function coerceIotGateway(features: FeaturesConfig): FeaturesConfig {
  const needsGateway = IOT_DEPENDENT_FEATURES.some((f) => features[f])
  if (needsGateway && !features.iot_gateway) {
    return { ...features, iot_gateway: true }
  }
  return features
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — UI / display helpers
// ─────────────────────────────────────────────────────────────────────────────

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  full_maintenance: 'תחזוקה מלאה',
  basic_management: 'ניהול בסיסי',
  premium: 'פרימיום',
  custom: 'מותאם אישית',
}

export const CONTRACT_TYPE_DESCRIPTIONS: Record<ContractType, string> = {
  full_maintenance: 'כל שירותי התחזוקה, כולל IoT, בטחון ותחזוקה מונעת מלאה.',
  basic_management: 'ניהול בסיסי, CCTV ותחזוקה שוטפת. ללא חיישני IoT.',
  premium: 'כל שירותי תחזוקה מלאה + EV Charging ומדידת אנרגיה.',
  custom: 'בחירה עצמאית של כל מודול בנפרד.',
}

export const FEATURE_LABELS: Record<OnboardingFeature, string> = {
  smart_locks: 'מנעולים חכמים',
  pump_monitoring: 'ניטור משאבות',
  gardening: 'גינון',
  elevator_monitoring: 'ניטור מעלית',
  ev_charging: 'טעינת EV',
  cctv: 'CCTV / מצלמות',
  energy_metering: 'מד אנרגיה חכם',
  pest_control: 'הדברה',
  cleaning: 'ניקיון שוטף',
  iot_gateway: 'IoT Gateway',
}

export const PHASE_LABELS: Record<OnboardingPhase, string> = {
  setup: 'התקנה פיזית',
  commissioning: 'קומיסיונינג ובדיקות',
  handover: 'מסירה וחתימות',
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'ממתין',
  assigned: 'שובץ',
  in_progress: 'בביצוע',
  done: 'הושלם',
  skipped: 'דולג',
}

export const ONBOARDING_STATUS_LABELS: Record<OnboardingStatus, string> = {
  draft: 'טיוטה',
  tasks_generated: 'משימות נוצרו',
  in_progress: 'בתהליך',
  completed: 'הושלם',
  cancelled: 'בוטל',
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — Server action input / output shapes
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateOnboardingConfigInput {
  buildingId: string
  contractType: ContractType
  featuresConfig: FeaturesConfig
  agreementReference?: string
  agreementSignedAt?: string           // ISO date string
  committeeContactName?: string
  committeeContactPhone?: string
  committeeContactEmail?: string
  notes?: string
}

export interface AssignOnboardingTaskInput {
  taskId: string
  supplierId: string
  scheduledStartDate?: string          // ISO date string
  scheduledEndDate?: string            // ISO date string
}

export interface OnboardingReadiness {
  scorePct: number
  doneCount: number
  mandatoryTotal: number
  byPhase: Record<OnboardingPhase, { total: number; done: number }>
  blockingTasks: ErpOnboardingTaskInstance[]
}
