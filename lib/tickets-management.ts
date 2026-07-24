import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { TicketManagementTableRow, TicketStatusUi, TicketUrgency } from "@/types/tickets-management"
import type { TicketPriority, TicketRow, TicketStatus } from "@/types/ticket"

type TicketListFields = Pick<
  TicketRow,
  | "id"
  | "title"
  | "priority"
  | "status"
  | "building_id"
  | "apartment_id"
  | "created_at"
  | "sla_due_at"
>

function mapPriorityToUrgency(p: TicketPriority): TicketUrgency {
  if (p === "P1") return "high"
  if (p === "P2") return "medium"
  return "low"
}

function mapStatusToUi(s: TicketStatus): TicketStatusUi {
  if (s === "open") return "open"
  if (s === "in_progress") return "in_progress"
  if (s === "resolved") return "resolved"
  return "closed"
}

function formatOpenedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function formatDisplayId(uuid: string): string {
  return `T-${uuid.replace(/-/g, "").slice(0, 10).toUpperCase()}`
}

function truncateTitle(title: string, max = 48): string {
  const t = title.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

function buildLocation(
  buildingName: string,
  unitNumber: string | null
): string {
  if (unitNumber) {
    return `${buildingName}, דירה ${unitNumber}`
  }
  return buildingName
}

/**
 * טוען קריאות לטבלת הניהול — שאילתה + בניינים ודירות לשם מיקום.
 * מחזיר שגיאה רק כשהשאילתה הראשית נכשלת (טבלה / הרשאות).
 */
export async function getTicketsManagementViewModel(): Promise<{
  rows: TicketManagementTableRow[]
  error: string | null
}> {
  try {
    const supabase = createSupabaseServerClient()
    const { data: ticketsRaw, error: ticketsError } = await supabase
      .from("tickets")
      .select(
        "id, title, priority, status, building_id, apartment_id, created_at, sla_due_at"
      )
      .order("created_at", { ascending: false })

    if (ticketsError) {
      return { rows: [], error: ticketsError.message }
    }

    const tickets = (ticketsRaw ?? []) as TicketListFields[]
    if (tickets.length === 0) {
      return { rows: [], error: null }
    }

    const buildingIds = [...new Set(tickets.map((t) => t.building_id))]
    const apartmentIds = [
      ...new Set(
        tickets.map((t) => t.apartment_id).filter(Boolean)
      ),
    ] as string[]

    const buildingsRes = await supabase
      .from("buildings")
      .select("id, name")
      .in("id", buildingIds)

    const apartmentsRes =
      apartmentIds.length > 0
        ? await supabase
            .from("apartments")
            .select("id, unit_number")
            .in("id", apartmentIds)
        : { data: [] as { id: string; unit_number: string }[], error: null }

    const nameByBuildingId = new Map<string, string>()
    if (!buildingsRes.error && buildingsRes.data) {
      for (const b of buildingsRes.data as { id: string; name: string }[]) {
        nameByBuildingId.set(b.id, b.name?.trim() || "בניין")
      }
    }

    const unitByApartmentId = new Map<string, string>()
    if (!apartmentsRes.error && apartmentsRes.data) {
      for (const a of apartmentsRes.data as {
        id: string
        unit_number: string
      }[]) {
        unitByApartmentId.set(a.id, String(a.unit_number ?? "").trim())
      }
    }

    const rows: TicketManagementTableRow[] = tickets.map((t) => {
      const buildingName =
        nameByBuildingId.get(t.building_id) ?? "מיקום לא ידוע"
      const unit =
        t.apartment_id != null
          ? unitByApartmentId.get(t.apartment_id) || null
          : null

      return {
        sourceId: t.id,
        id: formatDisplayId(t.id),
        location: buildLocation(buildingName, unit),
        categoryHe: truncateTitle(t.title),
        urgency: mapPriorityToUrgency(t.priority as TicketPriority),
        status: mapStatusToUi(t.status as TicketStatus),
        openedAtLabel: formatOpenedAt(t.created_at),
        slaDueAt: t.sla_due_at ?? null,
        slaBreached:
          t.sla_due_at != null &&
          new Date(t.sla_due_at) < new Date() &&
          t.status !== "resolved" &&
          t.status !== "closed",
      }
    })

    return { rows, error: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : "שגיאה לא ידועה"
    return { rows: [], error: message }
  }
}
