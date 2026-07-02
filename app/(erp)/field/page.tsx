import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HardHat,
  MapPin,
  Wrench,
} from "lucide-react"

import { COMPANY_COOKIE_KEY, resolveCompanyContext } from "@/lib/company-context"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type WoStatus = "open" | "assigned" | "in_progress" | "pending_verification" | "closed" | "cancelled"
type Priority = "P1" | "P2" | "P3" | "P4"

interface WorkOrderRow {
  id: string
  wo_number: string
  title: string
  description: string | null
  category: string
  priority: Priority
  status: WoStatus
  sla_resolution_due_at: string | null
  actual_start_at: string | null
  buildings: { name: string; city: string | null } | null
  erp_physical_assets: { name: string; asset_type: string } | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Display helpers
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<WoStatus, string> = {
  open: "פתוח",
  assigned: "שובץ",
  in_progress: "בביצוע",
  pending_verification: "ממתין לאישור",
  closed: "סגור",
  cancelled: "בוטל",
}

const PRIORITY_COLOR: Record<Priority, string> = {
  P1: "bg-red-100 text-red-700 border-red-200",
  P2: "bg-orange-100 text-orange-700 border-orange-200",
  P3: "bg-blue-100 text-blue-700 border-blue-200",
  P4: "bg-slate-100 text-slate-600 border-slate-200",
}

const STATUS_COLOR: Record<WoStatus, string> = {
  open: "bg-slate-100 text-slate-700",
  assigned: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  pending_verification: "bg-purple-100 text-purple-700",
  closed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-500",
}

function isOverdue(dueAt: string | null): boolean {
  if (!dueAt) return false
  return new Date(dueAt) < new Date()
}

function formatDue(dueAt: string | null): string {
  if (!dueAt) return "ללא מועד יעד"
  const d = new Date(dueAt)
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

// ─────────────────────────────────────────────────────────────────────────────
// Work Order Card — mobile-first touch target
// ─────────────────────────────────────────────────────────────────────────────

function WorkOrderCard({ wo }: { wo: WorkOrderRow }) {
  const overdue = isOverdue(wo.sla_resolution_due_at) && wo.status !== "closed"

  return (
    <Link href={`/erp/field/work-orders/${wo.id}`} className="block focus:outline-none">
      <Card
        className={cn(
          "rounded-2xl border shadow-sm transition-shadow active:shadow-none hover:shadow-md",
          overdue && "border-red-300 bg-red-50/40"
        )}
      >
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-start justify-between gap-2">
            {/* Priority badge */}
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                PRIORITY_COLOR[wo.priority]
              )}
            >
              {wo.priority}
            </span>

            {/* Status badge */}
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                STATUS_COLOR[wo.status]
              )}
            >
              {STATUS_LABELS[wo.status]}
            </span>
          </div>

          <CardTitle className="mt-2 text-base leading-snug line-clamp-2">
            {wo.title}
          </CardTitle>

          <p className="text-xs text-muted-foreground mt-0.5">{wo.wo_number}</p>
        </CardHeader>

        <CardContent className="px-4 pb-2 space-y-1.5">
          {/* Building + asset location */}
          {wo.buildings && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {wo.buildings.name}
                {wo.buildings.city ? `, ${wo.buildings.city}` : ""}
              </span>
            </div>
          )}
          {wo.erp_physical_assets && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Wrench className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{wo.erp_physical_assets.name}</span>
            </div>
          )}

          {/* SLA due */}
          <div
            className={cn(
              "flex items-center gap-1.5 text-sm",
              overdue ? "text-red-600 font-medium" : "text-muted-foreground"
            )}
          >
            {overdue ? (
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <Clock className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{overdue ? "פגות SLA — " : "יעד: "}{formatDue(wo.sla_resolution_due_at)}</span>
          </div>
        </CardContent>

        <CardFooter className="px-4 pb-4 pt-0">
          {/* CTA hint */}
          <span className="text-xs font-medium text-primary">
            {wo.status === "in_progress" ? "המשך ביצוע ←" : "פתח פקודת עבודה ←"}
          </span>
        </CardFooter>
      </Card>
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function FieldDashboardPage() {
  const cookieStore = await cookies()
  const companyId = resolveCompanyContext(cookieStore.get(COMPANY_COOKIE_KEY)?.value)
  if (!companyId) redirect("/login")

  const supabase = createSupabaseServiceRoleClient()

  // Get the authenticated user's supplier ID (if they are a supplier)
  // For field technicians the session user is associated with a supplier record
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Resolve the supplier linked to this user (via erp_user_company_roles)
  let supplierFilter: string | null = null
  if (user?.id) {
    const { data: role } = await supabase
      .from("erp_user_company_roles")
      .select("supplier_id")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .not("supplier_id", "is", null)
      .maybeSingle()

    supplierFilter = role?.supplier_id ?? null
  }

  // Fetch active WOs — if the user is linked to a supplier, filter by it;
  // otherwise (property manager / admin) show all open WOs for the company
  let query = supabase
    .from("erp_work_orders")
    .select(
      `id, wo_number, title, description, category, priority, status,
       sla_resolution_due_at, actual_start_at,
       buildings ( name, city ),
       erp_physical_assets ( name, asset_type )`
    )
    .eq("company_id", companyId)
    .not("status", "in", '("closed","cancelled")')
    .order("priority", { ascending: true })
    .order("sla_resolution_due_at", { ascending: true, nullsFirst: false })

  if (supplierFilter) {
    query = query.eq("assigned_to_supplier_id", supplierFilter)
  }

  const { data: workOrders } = await query
  const wos = (workOrders ?? []) as unknown as WorkOrderRow[]

  // Split into actionable groups
  const inProgress = wos.filter((w) => w.status === "in_progress")
  const assigned   = wos.filter((w) => w.status === "assigned")
  const open       = wos.filter((w) => w.status === "open")
  const other      = wos.filter((w) => !["in_progress", "assigned", "open"].includes(w.status))

  return (
    <main className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      {/* ── Header ── */}
      <header className="sticky top-0 z-10 bg-white border-b shadow-sm px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <HardHat className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">לוח שטח</h1>
            <p className="text-xs text-muted-foreground">
              {wos.length === 0 ? "אין פקודות עבודה פעילות" : `${wos.length} פקודות עבודה פעילות`}
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-8">
        {wos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            <p className="text-base font-medium text-muted-foreground">
              אין פקודות עבודה פעילות
            </p>
            <p className="text-sm text-muted-foreground">
              כל הפקודות הושלמו או טרם שובצת לאחת.
            </p>
          </div>
        )}

        {inProgress.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-amber-700 mb-3 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              בביצוע ({inProgress.length})
            </h2>
            <div className="space-y-3">
              {inProgress.map((wo) => <WorkOrderCard key={wo.id} wo={wo} />)}
            </div>
          </section>
        )}

        {assigned.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-blue-700 mb-3 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              שובצו אלי ({assigned.length})
            </h2>
            <div className="space-y-3">
              {assigned.map((wo) => <WorkOrderCard key={wo.id} wo={wo} />)}
            </div>
          </section>
        )}

        {open.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
              פתוחים לאחיזה ({open.length})
            </h2>
            <div className="space-y-3">
              {open.map((wo) => <WorkOrderCard key={wo.id} wo={wo} />)}
            </div>
          </section>
        )}

        {other.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />
              ממתינים לאישור ({other.length})
            </h2>
            <div className="space-y-3">
              {other.map((wo) => <WorkOrderCard key={wo.id} wo={wo} />)}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
