import { notFound, redirect } from "next/navigation"
import { cookies } from "next/headers"

import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import { WorkOrderExecutionEngine } from "@/components/erp/field/work-order-execution-engine"

// ─────────────────────────────────────────────────────────────────────────────
// Types passed to the client execution engine
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkOrderDetail {
  id: string
  wo_number: string
  title: string
  description: string | null
  category: string
  priority: string
  status: string
  verification_method: string | null
  before_photo_url: string | null
  after_photo_url: string | null
  sla_resolution_due_at: string | null
  actual_start_at: string | null
  checkin_lat: number | null
  checkin_lng: number | null
  buildings: { id: string; name: string; city: string | null; address_line1: string | null } | null
  erp_physical_assets: {
    id: string
    name: string
    asset_type: string
    serial_number: string | null
    model: string | null
    manufacturer: string | null
    hardware_meta: Record<string, unknown>
  } | null
}

export interface OnboardingTaskDetail {
  id: string
  task_name: string
  task_description: string | null
  phase: string
  is_mandatory: boolean
  status: string
  checklist_items: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Page — Next.js 15 async params
// ─────────────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function FieldWorkOrderPage({ params }: PageProps) {
  const { id } = await params

  const cookieStore = await cookies()
  const companyId = resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value)
  if (!companyId) redirect("/login")

  const supabase = createSupabaseServiceRoleClient()

  // 1. Fetch full work order + related building + asset
  const { data: wo } = await supabase
    .from("erp_work_orders")
    .select(
      `id, wo_number, title, description, category, priority, status,
       verification_method, before_photo_url, after_photo_url,
       sla_resolution_due_at, actual_start_at,
       checkin_lat, checkin_lng,
       buildings ( id, name, city, address_line1 ),
       erp_physical_assets (
         id, name, asset_type, serial_number, model, manufacturer, hardware_meta
       )`
    )
    .eq("id", id)
    .eq("company_id", companyId)
    .single()

  if (!wo) notFound()

  const workOrder = wo as unknown as WorkOrderDetail

  // 2. If the WO originated from an onboarding task, fetch its context
  // (provides the checklist_items for the execution engine)
  let onboardingTask: OnboardingTaskDetail | null = null

  const { data: taskInstance } = await supabase
    .from("erp_onboarding_task_instances")
    .select(
      `id, status, is_mandatory,
       erp_onboarding_templates (
         task_name, task_description, phase, is_mandatory, checklist_items
       )`
    )
    .eq("work_order_id", id)
    .maybeSingle()

  if (taskInstance) {
    const tpl = (taskInstance.erp_onboarding_templates as unknown) as {
      task_name: string
      task_description: string | null
      phase: string
      is_mandatory: boolean
      checklist_items: string[]
    } | null

    if (tpl) {
      onboardingTask = {
        id: taskInstance.id,
        task_name: tpl.task_name,
        task_description: tpl.task_description,
        phase: tpl.phase,
        is_mandatory: tpl.is_mandatory,
        status: taskInstance.status,
        checklist_items: tpl.checklist_items ?? [],
      }
    }
  }

  return (
    <WorkOrderExecutionEngine
      workOrder={workOrder}
      onboardingTask={onboardingTask}
    />
  )
}
