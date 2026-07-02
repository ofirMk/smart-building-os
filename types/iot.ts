/**
 * IoT Module — TypeScript interfaces
 *
 * Covers:
 *  - DB row types for the five new tables (erp_iot_events, erp_iot_rules,
 *    erp_physical_assets, erp_hardware_action_log, erp_work_orders subset)
 *  - Inbound webhook payload shapes per hardware vendor
 *  - pg_notify notification envelope
 *  - Rule evaluation types used by the AI Worker correlator
 */

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Enum mirrors (match the DB enums exactly)
// ─────────────────────────────────────────────────────────────────────────────

export type IotProvider = 'verkada' | 'salto' | 'butterflymx' | 'custom'

export type ErpAssetType =
  | 'elevator'
  | 'pump'
  | 'smart_lock'
  | 'camera'
  | 'hvac_unit'
  | 'electrical_panel'
  | 'generator'
  | 'water_meter'
  | 'fire_system'
  | 'intercom'
  | 'barrier_gate'
  | 'other'

export type ErpLocationLevel = 'building' | 'floor' | 'zone' | 'unit'

export type ErpZoneType =
  | 'lobby'
  | 'corridor'
  | 'parking'
  | 'roof'
  | 'utility_room'
  | 'storage'
  | 'stairwell'
  | 'elevator_shaft'
  | 'gym'
  | 'pool_area'
  | 'other'

export type ErpWoStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'pending_verification'
  | 'closed'
  | 'cancelled'

export type ErpWoCategory =
  | 'electrical'
  | 'plumbing'
  | 'hvac'
  | 'security_access'
  | 'structural'
  | 'cleaning'
  | 'elevator'
  | 'iot_device'
  | 'general'
  | 'other'

export type ErpTriggerSource = 'human' | 'system_automated' | 'iot_sensor'

export type ErpPreventiveFrequency =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'semi_annual'
  | 'annual'

export type ErpVerificationMethod =
  | 'tenant_feedback'
  | 'gps_checkin'
  | 'sensor_restore'
  | 'manual_admin'

export type ErpVerificationStatus = 'pending' | 'verified' | 'disputed'

export type TicketPriority = 'P1' | 'P2' | 'P3' | 'P4'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — hardware_meta JSONB shape
// Stored in erp_physical_assets.hardware_meta
// ─────────────────────────────────────────────────────────────────────────────

export interface HardwareMeta {
  /** Network MAC address of the device (primary lookup key for webhooks) */
  mac?: string
  /** Internal gateway / controller identifier */
  gateway_id?: string
  /** Hardware vendor integration channel */
  provider?: IotProvider
  /** The event topic this device emits (used for rule matching) */
  webhook_topic?: string
  /** Normal operating vibration frequency in Hz (for predictive maintenance) */
  baseline_vibration_hz?: number
  /** % deviation from baseline that triggers an alert */
  alert_threshold_pct?: number
  /** Current firmware version string */
  firmware_version?: string
  /** ISO timestamp of the last firmware version check */
  last_firmware_check_at?: string
  /** Any additional vendor-specific fields */
  [key: string]: unknown
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — DB row types
// ─────────────────────────────────────────────────────────────────────────────

export interface ErpPhysicalAsset {
  id: string
  company_id: string
  asset_type: ErpAssetType
  name: string
  serial_number: string | null
  model: string | null
  manufacturer: string | null
  install_date: string | null          // ISO date
  warranty_expiry_date: string | null  // ISO date
  hardware_meta: HardwareMeta
  location_level: ErpLocationLevel
  building_id: string | null
  floor_id: string | null
  zone_id: string | null
  unit_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/** erp_iot_events row — the staging buffer for inbound webhooks */
export interface ErpIotEvent {
  id: string
  company_id: string
  asset_id: string | null
  provider: IotProvider
  /** Normalised snake_case event label (e.g. 'door_open', 'tailgate_detected') */
  event_type: string
  /** Raw vendor webhook body, stored verbatim */
  raw_payload: Record<string, unknown>
  processed: boolean
  processed_at: string | null
  work_order_id: string | null
  matched_rule_id: string | null
  /** Shared UUID assigned by the Worker to correlated events */
  correlation_id: string | null
  received_at: string
}

export type ErpIotEventInsert = Omit<
  ErpIotEvent,
  'id' | 'processed' | 'processed_at' | 'work_order_id' | 'matched_rule_id' | 'correlation_id'
>

/** erp_iot_rules row — one dynamic correlation rule per company */
export interface ErpIotRule {
  id: string
  company_id: string
  rule_name: string
  description: string | null
  is_active: boolean
  required_event_types: string[]
  correlation_window_sec: number
  required_asset_types: ErpAssetType[] | null
  same_zone_required: boolean
  same_building_required: boolean
  action_type: 'CREATE_WORK_ORDER' | 'SEND_ALERT' | 'COMPOSITE'
  wo_params: IotRuleWoParams
  additional_actions: IotRuleAdditionalAction[]
  rule_priority: number
  created_at: string
  updated_at: string
}

export interface IotRuleWoParams {
  category: ErpWoCategory
  priority: TicketPriority
  title_template: string
  description_template?: string
}

export interface IotRuleAdditionalAction {
  type: 'LOCK_NEXT_DOOR' | 'PUSH_NOTIFY' | 'LOCK_BARRIER' | 'TRIGGER_ALARM'
  /** For LOCK_NEXT_DOOR: which asset relative to the event zone to lock */
  asset_filter?: string
  /** For PUSH_NOTIFY: which role receives the alert */
  target_role?: 'property_manager' | 'subcontractor'
  /** For PUSH_NOTIFY targeting subcontractors: only suppliers of this category */
  supplier_category?: ErpWoCategory
  message_template?: string
}

/** erp_hardware_action_log row — immutable outbound hardware command log */
export interface ErpHardwareActionLog {
  id: string
  company_id: string
  work_order_id: string | null
  iot_event_id: string | null
  asset_id: string | null
  action_type:
    | 'LOCK_DOOR'
    | 'UNLOCK_DOOR'
    | 'LOCK_BARRIER'
    | 'UNLOCK_BARRIER'
    | 'SET_HVAC_SETPOINT'
    | 'TRIGGER_ALARM'
    | 'SEND_PUSH_ALERT'
    | 'OTHER'
  provider: string
  request_payload: Record<string, unknown>
  response_payload: Record<string, unknown> | null
  status: 'pending' | 'success' | 'failed' | 'timeout'
  executed_by: string   // 'system' or a profiles.id UUID string
  executed_at: string
  response_at: string | null
  note: string | null
}

export type ErpHardwareActionLogInsert = Omit<
  ErpHardwareActionLog,
  'id' | 'response_payload' | 'response_at'
>

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Vendor webhook payload shapes
// Each vendor uses its own JSON structure. These types are used during
// normalisation at the webhook ingest endpoint.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verkada webhook payload
 * Docs: https://apidocs.verkada.com/reference/webhook-events
 * Header: X-Verkada-Signature: sha256=<hex>
 */
export interface VerkadaWebhookPayload {
  event_id: string
  /** Verkada device UUID — matched to hardware_meta.mac via Verkada API, or
   *  stored directly in hardware_meta.gateway_id */
  device_id: string
  device_type: string
  /** ISO 8601 UTC timestamp */
  timestamp: string
  /**
   * Normalised event type. We map Verkada's event codes to our snake_case
   * convention in the webhook ingest handler.
   */
  event_type:
    | 'LPED_ENTRY'       // → door_open
    | 'LPE_TAILGATE'     // → tailgate_detected
    | 'MOTION'           // → motion_detected
    | 'DOOR_HELD_OPEN'   // → door_held_open
    | 'DOOR_FORCED'      // → door_forced
    | string
  /**
   * Set by Verkada's edge AI when the camera detects an anomaly.
   * 'tailgate' means two people passed on one credential.
   */
  anomaly_type?: 'tailgate' | 'forced_entry' | null
  /** How many people the camera counted crossing the threshold */
  person_count?: number
  /** Seconds the door has been held open (for DOOR_HELD_OPEN events) */
  door_held_seconds?: number
  camera_metadata?: {
    confidence: number
    bounding_box_count: number
  }
  [key: string]: unknown
}

/**
 * Salto KS / Salto Space webhook payload
 * Header: X-Salto-Signature-256: <hex>
 */
export interface SaltoWebhookPayload {
  /** Salto internal event UUID */
  id: string
  type:
    | 'ACCESS_GRANTED'   // → door_open
    | 'ACCESS_DENIED'
    | 'DOOR_FORCED'      // → door_forced
    | 'DOOR_LEFT_OPEN'   // → door_held_open
    | string
  /** Salto device UUID — matched to hardware_meta.gateway_id */
  device_uuid: string
  site_id: string
  credential_type: 'card' | 'mobile' | 'pin' | 'qr'
  timestamp: string    // ISO 8601
  /** Salto user UUID — optional (absent for anonymous/forced events) */
  user_id?: string
  /** Seconds the door has been open without closing */
  door_open_seconds?: number
  [key: string]: unknown
}

/**
 * ButterflyMX webhook payload
 * Header: X-Bmx-Webhook-Token: <raw token>
 */
export interface ButterflyMxWebhookPayload {
  event_uuid: string
  event_name: 'door.opened' | 'call.started' | 'door.held_open' | string
  panel_id: string
  unit_id?: string
  occurred_at: string
  [key: string]: unknown
}

/**
 * Custom / generic webhook payload (for in-house or non-standard sensors)
 * Header: X-Webhook-Signature: sha256=<hex>
 */
export interface CustomWebhookPayload {
  /** Matches hardware_meta.mac or hardware_meta.gateway_id */
  device_id: string
  event_type: string
  timestamp: string
  payload: Record<string, unknown>
  [key: string]: unknown
}

export type VendorWebhookPayload =
  | VerkadaWebhookPayload
  | SaltoWebhookPayload
  | ButterflyMxWebhookPayload
  | CustomWebhookPayload

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — Normalised internal event (after vendor-specific mapping)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The normalised event record produced by the webhook ingest handler.
 * This is what gets INSERTed into erp_iot_events.
 */
export interface NormalisedIotEvent {
  company_id: string
  asset_id: string | null
  provider: IotProvider
  /** Normalised snake_case event type (our canonical vocabulary) */
  event_type: string
  /** Raw vendor payload stored verbatim */
  raw_payload: Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — pg_notify envelope
// Emitted by the erp_iot_event_notify() DB trigger after each INSERT.
// Received by the AI Worker asyncpg LISTEN handler.
// ─────────────────────────────────────────────────────────────────────────────

export interface IotEventNotification {
  event_id: string
  company_id: string
  asset_id: string | null
  event_type: string
  provider: IotProvider
  /** ISO 8601 UTC */
  received_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — Rule evaluation types (mirrored in Python correlator)
// ─────────────────────────────────────────────────────────────────────────────

/** Zone risk classification used by the correlator's evaluation logic */
export type ZoneRiskLevel = 'sterile' | 'public' | 'unknown'

/** Outcome produced by RuleEvaluator for a correlated event batch */
export interface RuleEvaluationResult {
  matched: boolean
  rule: ErpIotRule | null
  /** Action the dispatcher should take */
  action: 'CREATE_WORK_ORDER' | 'SILENT_LOG' | 'NO_ACTION'
  /** Derived work-order fields, populated when action = CREATE_WORK_ORDER */
  wo_override?: {
    priority: TicketPriority
    title: string
    description: string
    category: ErpWoCategory
  }
  /** Human-readable reason for the decision (for audit log) */
  reason: string
}
